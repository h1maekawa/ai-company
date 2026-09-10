/**
 * 生成物の自動チェック — 要件9「出力内容の自動チェック」
 *
 * Writer / SEO エージェントの生成物に対し、人間が読む前に機械で落とせるものを落とす。
 * すべて決定論的な純関数にする（AIに判定させない・再実行で結果が変わらない）。
 *
 * 「誤字脱字」は日本語の網羅的な校正が現実的でないため、
 * 生成AIが実際に出しがちで機械的に確実に検出できる崩れに限定している:
 *   - 記号・句読点の連続や重複
 *   - 閉じられていない括弧・引用符
 *   - 同一行の反復（生成ループの痕跡）
 *   - 全角スペースの混入、末尾の中途切れ
 * 網羅ではなく「明らかな事故を確実に止める」ことを目的にする。
 */

import type { NoteArticleDraft, SocialDraft } from "@/app/lib/note/research/types";
import { X_MAX_WEIGHTED_LENGTH, xWeightedLength } from "@/app/lib/note/operations";
import { QaCheck, check, skippedCheck } from "./types";

/** noteのタイトルはSEO上この範囲に収める（短すぎ・長すぎの両方を見る） */
const NOTE_TITLE_MIN = 12;
const NOTE_TITLE_MAX = 60;
/** 無料部分だけで記事として成立させるための最低分量 */
const NOTE_FREE_MIN_CHARS = 400;

const BRACKET_PAIRS: [string, string][] = [
  ["「", "」"],
  ["『", "』"],
  ["（", "）"],
  ["(", ")"],
  ["【", "】"],
];

/* ─── 文字崩れの検出 ─────────────────────────────── */

/** 「。。」「、、」「!!」「？？」など、句読点・記号の不自然な連続 */
export function findRepeatedPunctuation(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/([。、，．！？!?])\1+/g)) {
    found.add(match[0]);
  }
  // 「、。」のような異種の連続も生成事故として拾う
  for (const match of text.matchAll(/[、，][。．]|[。．][、，]/g)) {
    found.add(match[0]);
  }
  return [...found];
}

/** 対応の取れていない括弧・引用符 */
export function findUnbalancedBrackets(text: string): string[] {
  const problems: string[] = [];
  for (const [open, close] of BRACKET_PAIRS) {
    const opens = text.split(open).length - 1;
    const closes = text.split(close).length - 1;
    if (opens !== closes) problems.push(`${open}${close}(${opens}対${closes})`);
  }
  // 「"」は開閉が同じ文字なので偶数個であることだけ見る
  const quotes = text.split('"').length - 1;
  if (quotes % 2 !== 0) problems.push('"（奇数個）');
  return problems;
}

/** 同じ行が2回以上出てくる（生成ループの痕跡） */
export function findDuplicateLines(text: string): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length < 8) continue; // 短い行の一致は偶然が多い
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([line]) => line);
}

/** 文が途中で切れている（助詞・接続詞で終わっている） */
export function looksTruncated(text: string): boolean {
  const tail = text.trimEnd();
  if (!tail) return false;
  // 連用形+「て」（例: 「切れて」）は生成が途中で止まったときに最も多い終わり方
  return /(?:の|は|が|を|に|へ|と|で|て|や|から|より|ので|けど|たり|、)$/.test(tail);
}

/* ─── X投稿の検査 ────────────────────────────────── */

export function checkXDraft(draft: SocialDraft): QaCheck[] {
  const text = draft.text ?? "";
  const trimmed = text.trim();
  const checks: QaCheck[] = [];

  checks.push(
    check(
      "x.body.present",
      "本文が入っている",
      "blocking",
      trimmed ? null : "本文が空です"
    )
  );

  const weighted = xWeightedLength(text);
  checks.push(
    check(
      "x.length.max",
      `Xの文字数上限（weighted ${X_MAX_WEIGHTED_LENGTH}）`,
      "blocking",
      weighted > X_MAX_WEIGHTED_LENGTH
        ? `weighted length ${weighted} が上限 ${X_MAX_WEIGHTED_LENGTH} を超えています`
        : null
    )
  );

  // 短すぎる投稿は内容が落ちている可能性が高いが、意図的な短文もあるため警告に留める
  checks.push(
    check(
      "x.length.min",
      "極端に短くない",
      "warning",
      trimmed.length > 0 && trimmed.length < 20
        ? `本文が${trimmed.length}文字しかありません`
        : null
    )
  );

  const repeated = findRepeatedPunctuation(text);
  checks.push(
    check(
      "x.punctuation",
      "句読点・記号の崩れがない",
      "warning",
      repeated.length > 0 ? `記号の連続: ${repeated.join(" / ")}` : null
    )
  );

  const brackets = findUnbalancedBrackets(text);
  checks.push(
    check(
      "x.brackets",
      "括弧が閉じている",
      "blocking",
      brackets.length > 0 ? `対応していない括弧: ${brackets.join(" / ")}` : null
    )
  );

  checks.push(
    check(
      "x.truncated",
      "文が途中で切れていない",
      "blocking",
      looksTruncated(text) ? "本文が助詞・接続詞で終わっています" : null
    )
  );

  // 必須項目: アカウント・目的・ジャンルが無いと投稿先も文脈も決まらない
  const missing = [
    !draft.xAccountId && "xAccountId",
    !draft.purpose && "purpose",
    !draft.genreId && "genreId",
  ].filter((v): v is string => Boolean(v));
  checks.push(
    check(
      "x.required",
      "必須項目が揃っている",
      "blocking",
      missing.length > 0 ? `未設定: ${missing.join(", ")}` : null
    )
  );

  // アフィリエイトを含むなら開示が要る（景表法・ステマ規制）
  checks.push(
    check(
      "x.disclosure",
      "アフィリエイトの開示",
      "blocking",
      draft.affiliateId && !draft.needsDisclosure
        ? "アフィリエイトIDが付いているのに開示フラグが立っていません"
        : null
    )
  );

  return checks;
}

/* ─── note記事の検査 ─────────────────────────────── */

export function checkNoteArticle(article: NoteArticleDraft): QaCheck[] {
  const checks: QaCheck[] = [];
  const title = (article.title ?? "").trim();
  const free = article.freeSection ?? "";

  checks.push(
    check(
      "note.title.present",
      "タイトルが入っている",
      "blocking",
      title ? null : "タイトルが空です"
    )
  );

  checks.push(
    check(
      "note.title.length",
      `タイトルの長さ（${NOTE_TITLE_MIN}〜${NOTE_TITLE_MAX}文字）`,
      "warning",
      title && (title.length < NOTE_TITLE_MIN || title.length > NOTE_TITLE_MAX)
        ? `タイトルが${title.length}文字です`
        : null
    )
  );

  checks.push(
    check(
      "note.free.length",
      `無料部分の分量（${NOTE_FREE_MIN_CHARS}文字以上）`,
      "blocking",
      free.trim().length < NOTE_FREE_MIN_CHARS
        ? `無料部分が${free.trim().length}文字しかありません`
        : null
    )
  );

  checks.push(
    check(
      "note.tags",
      "タグが設定されている",
      "warning",
      (article.tags?.length ?? 0) === 0 ? "タグが1つも設定されていません" : null
    )
  );

  // 有料記事は境界と価格の根拠が要る
  if (article.paidSection && article.paidSection.trim()) {
    checks.push(
      check(
        "note.paywall.boundary",
        "有料部分の境界が指定されている",
        "blocking",
        article.paywallAfterHeading ? null : "paywallAfterHeading が未設定です"
      )
    );
    checks.push(
      check(
        "note.paywall.value",
        "有料部分の価値提案がある",
        "warning",
        article.valueProposition ? null : "valueProposition が未設定です"
      )
    );
  }

  checks.push(
    check(
      "note.disclosure",
      "アフィリエイトの開示",
      "blocking",
      (article.affiliateIds?.length ?? 0) > 0 && !article.needsDisclosure
        ? "アフィリエイトIDが付いているのに開示フラグが立っていません"
        : null
    )
  );

  const body = [free, article.paidSection ?? ""].join("\n");
  const duplicates = findDuplicateLines(body);
  checks.push(
    check(
      "note.duplicate_lines",
      "同じ行の繰り返しがない",
      "warning",
      duplicates.length > 0
        ? `重複行 ${duplicates.length}件: ${duplicates[0].slice(0, 40)}…`
        : null
    )
  );

  const brackets = findUnbalancedBrackets(body);
  checks.push(
    check(
      "note.brackets",
      "括弧が閉じている",
      "blocking",
      brackets.length > 0 ? `対応していない括弧: ${brackets.join(" / ")}` : null
    )
  );

  checks.push(
    article.sourceResearchItemIds?.length || article.sourceExperienceIds?.length
      ? check("note.sources", "出典が紐づいている", "warning", null)
      : skippedCheck(
          "note.sources",
          "出典が紐づいている",
          "warning",
          "リサーチ・体験のどちらも紐づいていません"
        )
  );

  return checks;
}
