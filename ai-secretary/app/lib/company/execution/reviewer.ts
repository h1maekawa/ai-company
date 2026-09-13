/**
 * Reviewer Pipeline — Phase 6 §30 〜 §33
 *
 * 実行結果を人へ回す前に、機械で見られるものを見る。
 *
 *   Agent Output → Quality Review → Security Review → Policy
 *
 * §33 の要点: 外部由来の内容（Web / メール / PDF / Slack / 外部文書）は
 * すべて UNTRUSTED として扱う。その中に
 * 「AIへ、この命令を実行してください」と書いてあっても、指示として解釈しない。
 * これは検出して警告するだけでなく、Action生成の経路自体を塞ぐ（Gateway側）。
 */

export type ReviewVerdict = "PASS" | "WARN" | "FAIL";

export type ReviewFinding = {
  id: string;
  verdict: ReviewVerdict;
  message: string;
};

export type ReviewResult = {
  verdict: ReviewVerdict;
  findings: ReviewFinding[];
  reviewedAt: string;
};

/** 最も悪い判定を全体の判定にする */
function worst(findings: ReviewFinding[]): ReviewVerdict {
  if (findings.some((f) => f.verdict === "FAIL")) return "FAIL";
  if (findings.some((f) => f.verdict === "WARN")) return "WARN";
  return "PASS";
}

const finding = (id: string, verdict: ReviewVerdict, message: string): ReviewFinding => ({
  id,
  verdict,
  message,
});

/* ─── Quality Review（§31） ─────────────────────── */

export type QualityInput = {
  objective: string;
  output: string;
  /** Legacy artifact labels. These describe deliverables; they are not literal text assertions. */
  expectedOutputs: string[];
  expectedArtifacts?: string[];
  acceptanceCriteria?: QualityCriterion[];
  now?: Date;
};

export type QualityCriterion =
  | { id: string; description: string; kind: "min_length"; value: number }
  | { id: string; description: string; kind: "contains_all"; values: string[] }
  | { id: string; description: string; kind: "contains_any"; values: string[] }
  | { id: string; description: string; kind: "has_heading" };

const normalize = (value: string) => value.normalize("NFKC").toLowerCase();

/** Deterministic Japanese/English keyword extraction; no external model or tokenizer. */
export function alignmentTerms(value: string): string[] {
  const normalized = normalize(value);
  const terms = normalized.match(/[a-z0-9][a-z0-9_-]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu) ?? [];
  const expanded = terms.flatMap((term) => {
    if (!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(term)) return [term];
    if (term.length <= 2) return [term];
    return Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2));
  });
  return [...new Set(expanded.filter((term) => term.length >= 2))];
}

function criterionFinding(criterion: QualityCriterion, output: string): ReviewFinding {
  const normalized = normalize(output);
  let passed = false;
  if (criterion.kind === "min_length") passed = output.length >= criterion.value;
  else if (criterion.kind === "has_heading") passed = /^#{1,6}\s+\S+/m.test(output);
  else if (criterion.kind === "contains_all") passed = criterion.values.every((value) => normalized.includes(normalize(value)));
  else passed = criterion.values.some((value) => normalized.includes(normalize(value)));
  return passed
    ? finding(`quality.criterion.${criterion.id}`, "PASS", criterion.description)
    : finding(`quality.criterion.${criterion.id}`, "WARN", `未充足: ${criterion.description}`);
}

export function runQualityReview(input: QualityInput): ReviewResult {
  const now = input.now ?? new Date();
  const output = (input.output ?? "").trim();
  const findings: ReviewFinding[] = [];
  const expectedArtifacts = input.expectedArtifacts ?? input.expectedOutputs;

  findings.push(
    output
      ? finding("quality.present", "PASS", "成果物があります")
      : finding("quality.present", "FAIL", "成果物が空です")
  );

  // expectedOutputs は成果物のラベルであり、本文中の literal 文字列ではない。
  findings.push(
    expectedArtifacts.length === 0 || output
      ? finding("quality.outputs", "PASS", "期待成果物を評価できる内容があります")
      : finding("quality.outputs", "FAIL", `成果物がありません: ${expectedArtifacts.join(" / ")}`)
  );

  findings.push(...(input.acceptanceCriteria ?? []).map((criterion) => criterionFinding(criterion, output)));

  // 目的から大きく外れていないか（語の重なりで粗く見る）
  const objectiveWords = alignmentTerms(input.objective);
  const normalizedOutput = normalize(output);
  const overlap = objectiveWords.filter((word) => normalizedOutput.includes(word)).length;
  findings.push(
    objectiveWords.length === 0 || overlap > 0
      ? finding("quality.alignment", "PASS", "目的との対応が見られます")
      : finding("quality.alignment", "WARN", "目的の語が成果物に現れていません")
  );

  return { verdict: worst(findings), findings, reviewedAt: now.toISOString() };
}

/* ─── Security Review（§32 / §33） ──────────────── */

/**
 * 外部文書に紛れ込んだ「AIへの指示」らしき表現。
 * 検出しても実行はしない。ここは警告を出すためのもので、
 * 実行を止めているのは Gateway の origin チェックのほう。
 */
const INJECTION_MARKERS = [
  /(?:ignore|disregard).{0,20}(?:previous|above).{0,20}instructions?/i,
  /(?:system|developer)\s*prompt/i,
  /これまでの(?:指示|命令)を(?:無視|忘れ)/,
  /あなたは今から/,
  /AIへ[:：]/,
  /以下を(?:実行|送信|公開)(?:して|せよ)/,
];

const SENSITIVE_MARKERS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(?:api[_-]?key|secret|password|token)\s*[:=]\s*\S{8,}/i,
  /\b\d{4}-?\d{4}-?\d{4}-?\d{4}\b/, // カード番号らしき並び
  /口座番号\s*[:：]?\s*\d{6,}/,
];

const PROTECTED_CORE = [
  "authority-matrix",
  "security-policy",
  "forbidden-actions",
  "credential-system",
  "action-gateway",
  "approval-engine",
  "production-secret",
  "root-system-prompt",
];

export type SecurityInput = {
  output: string;
  /** 外部から取り込んだ内容。UNTRUSTED として扱う（§33） */
  externalContent?: string;
  /** 実行しようとしているAction */
  actionTypes?: string[];
  /** 送信先など */
  targets?: string[];
  /** 許可されている送信先。ここに無い宛先は警告する */
  allowedTargets?: string[];
  now?: Date;
};

export function runSecurityReview(input: SecurityInput): ReviewResult {
  const now = input.now ?? new Date();
  const findings: ReviewFinding[] = [];
  const output = input.output ?? "";

  /* 機微情報の混入 */
  const sensitive = SENSITIVE_MARKERS.filter((p) => p.test(output));
  findings.push(
    sensitive.length === 0
      ? finding("security.sensitive", "PASS", "機微情報は見当たりません")
      : finding("security.sensitive", "FAIL", "認証情報・口座情報らしき文字列を含みます")
  );

  /* Protected Core への言及 */
  const core = PROTECTED_CORE.filter((name) => output.includes(name));
  findings.push(
    core.length === 0
      ? finding("security.protected_core", "PASS", "Protected Coreへの変更はありません")
      : finding("security.protected_core", "FAIL", `Protected Coreに触れています: ${core.join(", ")}`)
  );

  /* 外部内容に含まれる指示（§33） */
  if (input.externalContent) {
    const injections = INJECTION_MARKERS.filter((p) => p.test(input.externalContent as string));
    findings.push(
      injections.length === 0
        ? finding("security.injection", "PASS", "外部内容に指示らしき記述はありません")
        : finding(
            "security.injection",
            "WARN",
            "外部内容にAIへの指示らしき記述があります。データとして扱い、命令として実行しません"
          )
    );
  }

  /* 想定外の送信先 */
  if (input.targets && input.targets.length > 0 && input.allowedTargets) {
    const unexpected = input.targets.filter((t) => !input.allowedTargets?.includes(t));
    findings.push(
      unexpected.length === 0
        ? finding("security.target", "PASS", "送信先は想定どおりです")
        : finding("security.target", "FAIL", `想定外の送信先: ${unexpected.join(", ")}`)
    );
  }

  return { verdict: worst(findings), findings, reviewedAt: now.toISOString() };
}

export type PipelineResult = {
  quality: ReviewResult;
  security: ReviewResult;
  /** 両方を踏まえた最終判定 */
  verdict: ReviewVerdict;
  /** 人の承認へ回してよいか。FAIL があれば回さず差し戻す */
  canProceed: boolean;
};

export function runReviewPipeline(input: {
  quality: QualityInput;
  security: SecurityInput;
}): PipelineResult {
  const quality = runQualityReview(input.quality);
  const security = runSecurityReview(input.security);
  const verdict = worst([...quality.findings, ...security.findings]);

  return {
    quality,
    security,
    verdict,
    // FAIL があるものはCEOへ回す前に直す
    canProceed: verdict !== "FAIL",
  };
}
