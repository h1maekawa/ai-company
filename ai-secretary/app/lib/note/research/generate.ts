/**
 * トレンド候補と本人の体験から、X投稿 / note記事を作る。
 *
 * 生成時に必ず渡すもの:
 *   まえみち人格 / トレンドの「型」 / 登録済みの体験 / 投稿目的 /
 *   読者の悩み / 過去投稿 / 許可済みの導線とURL
 *
 * 守るもの（既存Note事業部と同じ）:
 *   - 登録済みURL以外は本文から除去
 *   - アフィリエイトを使ったらPR表記
 *   - credibility に無い数字は書かない
 *   - 未確認の体験を断定的な体験談にしない
 *   - 他者の投稿のコピー・言い換えを作らない
 */

import { callAI } from "../../ai/client";
import { AffiliateLink, Brand, Genre, XAccount } from "../types";
import { hashId } from "./fetcher";
import { checkSimilarity, SimilarityCandidate } from "./similarity";
import {
  AffiliatePolicy,
  ContentPurpose,
  ExperienceEntry,
  NoteArticleDraft,
  ResearchItem,
  SocialDraft,
  TrendCluster,
  OutputType,
  XPostLength,
} from "./types";
import { normalizeMediaSuggestion, normalizeXPattern, X_LENGTH_GUIDE } from "./x-format";

/* ─── 共通の前提ブロック ───────────────────── */

function brandBlock(brand: Brand): string {
  const { identity, personality } = brand;
  return `## ブランド
${identity.name} — ${identity.primaryTagline}
コンセプト: ${brand.concept}

## 人格
${personality.traits.join("、")}
${personality.basicStance.map((s) => `- ${s}`).join("\n")}

## 使いたい表現
${personality.preferredExpressions.map((s) => `- ${s}`).join("\n")}

## 絶対に使わない表現
${personality.avoidedExpressions.map((s) => `- ${s}`).join("\n")}

## 文章ルール
${personality.writingRules.map((s) => `- ${s}`).join("\n")}

## 読者
${brand.targetReader}

## 筆者が語れる根拠
${brand.credibility.length > 0 ? brand.credibility.map((c) => `- ${c}`).join("\n") : "（未登録。具体的な数字・成果を書いてはいけません）"}`;
}

/** 他者の本文は渡さない。抽出済みの「型」だけを渡す */
function trendBlock(cluster: TrendCluster, items: ResearchItem[]): string {
  const patterns = items
    .slice(0, 5)
    .map((i, n) =>
      [
        `${n + 1}.`,
        i.hookPattern ? `冒頭の型: ${i.hookPattern}` : "",
        i.structurePattern && i.structurePattern !== "（未分析）" ? `構成: ${i.structurePattern}` : "",
        i.emotionalAngle && i.emotionalAngle !== "（未分析）" ? `感情: ${i.emotionalAngle}` : "",
        i.readerProblem && i.readerProblem !== "（未分析）" ? `読者の悩み: ${i.readerProblem}` : "",
        i.ctaPattern && i.ctaPattern !== "（未分析）" ? `締めの型: ${i.ctaPattern}` : "",
      ]
        .filter(Boolean)
        .join(" / ")
    )
    .join("\n");

  return `## 今回のテーマ
${cluster.title}
${cluster.summary}

## 参考にする「型」（他者の文章そのものではありません）
${patterns || "（型は未分析です。ブランドの文体で素直に書いてください）"}

**重要**: 上は構造の参考です。他者の文章を写したり言い換えたりしないでください。`;
}

function experienceBlock(experiences: ExperienceEntry[]): string {
  if (experiences.length === 0) {
    return `## 筆者の体験
**登録された体験がありません。**
「やってみた」「試した」など、実際に体験したかのような書き方をしてはいけません。
一般的な考察・調べたことの整理として書いてください。`;
  }

  return `## 筆者の体験（ここに書かれたことだけを体験談として使えます）
${experiences
  .map((e) =>
    [
      `### ${e.title}`,
      e.summary && `概要: ${e.summary}`,
      e.whatHappened && `起きたこと: ${e.whatHappened}`,
      e.whatWasTried && `試したこと: ${e.whatWasTried}`,
      e.whatWorked && `うまくいったこと: ${e.whatWorked}`,
      e.whatDidNotWork && `うまくいかなかったこと: ${e.whatDidNotWork}`,
      e.lesson && `学び: ${e.lesson}`,
      e.reusableFacts.length > 0 && `使える事実: ${e.reusableFacts.join(" / ")}`,
      !e.verifiedByUser &&
        "※この体験は未確認です。断定せず「〜と思います」「〜な気がしています」程度に留めてください",
    ]
      .filter(Boolean)
      .join("\n")
  )
  .join("\n\n")}`;
}

function viewpointBlock(authorViewpoint?: string): string {
  if (!authorViewpoint?.trim()) {
    return `## 筆者の今回の意見
（未入力。一般的な考察に留め、筆者の意見を創作しないでください）`;
  }
  return `## 筆者がSlackで入力した今回の意見
${authorViewpoint.trim()}

この文章は今回の投稿に使う本人の見解です。主張の中心として自然に反映してください。
ただし、意見に含まれる数値・出来事・利用経験を、確認済みの客観的事実や実体験へ勝手に変換しないでください。`;
}

/* ─── X投稿の生成 ───────────────────────── */

const PURPOSE_GUIDE: Record<ContentPurpose, string> = {
  reach: "認知。単体で読み切れて、保存したくなる小さな気づきにする。リンクは入れない",
  trust: "信頼。具体的な手順や失敗を出して、読者に「この人は実際にやっている」と伝える",
  "note-bridge": "note誘導。投稿だけでも価値がある形にし、続きをnoteで読む理由を1つ示す",
  affiliate: "アフィリエイト。読者の悩みと案件が本当に一致する場合のみ。合わないなら書かない",
  "paid-note": "有料note誘導。無料で出せる範囲を出し切ってから、続きの価値を示す",
  "x-monetization": "X内で読み切る形。リンクなしで、返信・保存が起きやすい問いかけを含める",
};

export type GenerateXInput = {
  cluster: TrendCluster;
  items: ResearchItem[];
  experiences: ExperienceEntry[];
  brand: Brand;
  genre: Genre;
  account: XAccount;
  purpose: ContentPurpose;
  affiliate?: AffiliateLink;
  policy?: AffiliatePolicy;
  /** 類似チェック用の自分の過去投稿 */
  pastPosts: SimilarityCandidate[];
  /** Slackで本人が入力した、今回の投稿だけに使う見解 */
  authorViewpoint?: string;
  outputType?: OutputType;
  length?: XPostLength;
};

export type GenerateXResult = {
  drafts: SocialDraft[];
  /** 体験が無いなど、生成を止めた理由 */
  warning?: string;
};

export async function generateXPosts(input: GenerateXInput): Promise<GenerateXResult> {
  const { cluster, items, experiences, brand, genre, account, purpose, affiliate, policy } = input;

  // アフィリエイトをX本文に直接入れてよいかは、アカウント設定とポリシーの両方を満たす場合のみ
  const canUseDirectLink = Boolean(
    affiliate?.url &&
      account.directAffiliate &&
      policy?.directXAllowed &&
      policy.allowedChannels.includes("x")
  );

  const affiliateBlock = canUseDirectLink
    ? `## 使ってよいリンク
- ${affiliate!.serviceName}: ${affiliate!.url}
CTA文言の例: ${affiliate!.ctaText}
使う場合は投稿の冒頭に「${policy!.disclosureTextX}」を置いてください。
${policy!.claimRestrictions.length > 0 ? `禁止訴求: ${policy!.claimRestrictions.join(" / ")}` : ""}`
    : `## リンク
このアカウント／案件ではX本文にURLを入れられません。**URLを一切書かないでください。**`;

  const outputType = input.outputType ?? "x-post";
  const length = input.length ?? "standard";
  const formatGuide =
    outputType === "x-thread"
      ? `2〜7投稿のスレッドを1案作る。各投稿は単独でも意味が通り、threadPartsへ順番に入れる。`
      : outputType === "x-and-note"
        ? `note連携用に5案作る。patternは順に pre-release / publish / key-point / spinoff / reminder とする。URLは作らず、記事タイトルと価値を案内する。`
        : `次の3案を必ず1つずつ作る。
- opinion: 意見型（意外性のある結論→理由→本人の考え→余韻）
- save: 保存型（悩み・結論→3〜7要点→初心者向け補足→まとめ）
- conversation: 会話型（考え→本人の立場→答えやすい具体的な質問）`;

  const prompt = `あなたは「${brand.identity.name}」のX投稿を書くライターです。

${brandBlock(brand)}

${trendBlock(cluster, items)}

${experienceBlock(experiences)}

${viewpointBlock(input.authorViewpoint)}

## この投稿の目的
${PURPOSE_GUIDE[purpose]}

## ジャンル
${genre.label}（${genre.description}）

## このアカウントの役割
${account.role || "（未設定。ブランド全体のトーンに合わせる）"}

${affiliateBlock}

# 厳守事項
1. 他者の投稿を写さない・言い換えない
2. 登録された体験に無いことを「やった」と書かない
3. 「筆者が語れる根拠」に無い数字・成果を書かない
4. 強い命令形・感嘆符の多用・煽りをしない
5. 文字数は${X_LENGTH_GUIDE[length]}を目安にする。改行を使う。ハッシュタグは0〜2個
6. 「私は」という主語を自然に使う
7. 「どう思う？」だけの形式的な返信誘導をしない
8. 冒頭候補を3案、メディア案を1つ付ける。画像・動画は必須にしない

## 作る形式
${formatGuide}

# 出力（JSONのみ）
{
  "posts": [
    {
      "pattern": "opinion",
      "angle": "投稿の切り口",
      "text": "投稿本文",
      "hookCandidates": ["冒頭案1", "冒頭案2", "冒頭案3"],
      "mediaSuggestion": "text",
      "threadParts": []
    }
  ]
}
mediaSuggestionは text / diagram / screenshot / comparison / chart / video / note-thumbnail のいずれか。`;

  const message = `【テーマ】${cluster.title}
【読者の悩み】${cluster.summary}`;

  let posts: {
    angle?: string;
    pattern?: string;
    text?: string;
    hookCandidates?: string[];
    mediaSuggestion?: string;
    threadParts?: string[];
  }[] = [];
  try {
    const response = await callAI(message, prompt, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (match) posts = (JSON.parse(match[0]) as { posts?: typeof posts }).posts ?? [];
  } catch (error) {
    console.error("[note/generate] X投稿の生成に失敗:", error);
    return { drafts: [], warning: "生成に失敗しました。もう一度お試しください" };
  }

  const allowedUrls = new Set(canUseDirectLink ? [affiliate!.url] : []);
  const sourceCandidates: SimilarityCandidate[] = items.map((i) => ({
    label: i.sourceUrl,
    text: i.textExcerpt,
  }));

  const now = new Date().toISOString();
  const drafts: SocialDraft[] = [];

  const selectedPosts = posts.slice(0, outputType === "x-and-note" ? 5 : 3);
  for (const [postIndex, post] of selectedPosts.entries()) {
    const texts =
      outputType === "x-thread" && Array.isArray(post.threadParts) && post.threadParts.length >= 2
        ? post.threadParts.slice(0, 7)
        : post.text ? [post.text] : [];
    const threadId = outputType === "x-thread" ? hashId("th", `${cluster.id}${now}`) : undefined;
    for (const [threadIndex, rawText] of texts.entries()) {
    let text = String(rawText);

    // 未許可URLを除去（AIにURLを作らせない）
    const urls = text.match(/https?:\/\/[^\s)\]"'）]+/g) ?? [];
    const kept: string[] = [];
    for (const url of urls) {
      if (allowedUrls.has(url)) kept.push(url);
      else {
        console.warn(`[note/generate] X投稿から未許可URLを除去: ${url}`);
        text = text.split(url).join("").replace(/\s{2,}/g, " ").trim();
      }
    }

    const needsDisclosure = kept.length > 0;
    const disclosure = policy?.disclosureTextX ?? "[PR]";
    if (needsDisclosure && !text.includes(disclosure) && !text.includes("PR")) {
      text = `${disclosure} ${text}`;
    }

    const similarity = checkSimilarity(text, sourceCandidates, input.pastPosts);

    drafts.push({
      id: hashId("s", `${cluster.id}${post.angle ?? ""}${threadIndex}${now}${text.slice(0, 20)}`),
      trendClusterId: cluster.id,
      xAccountId: account.id,
      purpose,
      genreId: genre.id,
      text,
      pattern: normalizeXPattern(
        post.pattern ?? (["opinion", "save", "conversation"][postIndex] as string | undefined),
        outputType
      ),
      length,
      hookCandidates: Array.isArray(post.hookCandidates)
        ? post.hookCandidates.map(String).slice(0, 3)
        : [],
      mediaSuggestion: normalizeMediaSuggestion(post.mediaSuggestion),
      threadId,
      threadIndex: threadId ? threadIndex + 1 : undefined,
      threadTotal: threadId ? texts.length : undefined,
      urls: kept,
      affiliateId: needsDisclosure ? affiliate?.id : undefined,
      needsDisclosure,
      similarityScore: similarity.score,
      similarTo: similarity.blocked ? similarity.similarTo : undefined,
      // 類似しすぎている案は下書きに残すが、承認できないよう理由を持たせる
      status: "draft",
      failureReason: similarity.blocked ? similarity.reason : undefined,
      createdAt: now,
      updatedAt: now,
    });
    }
  }

  const warning =
    experiences.length === 0
      ? "登録済みの体験が無いため、一般的な考察として生成しました（体験談としては書いていません）"
      : undefined;

  return { drafts, warning };
}

/* ─── note記事の生成 ───────────────────────── */

export type GenerateNoteInput = {
  cluster: TrendCluster;
  items: ResearchItem[];
  experiences: ExperienceEntry[];
  brand: Brand;
  genre: Genre;
  articleType: "free" | "paid" | "affiliate";
  affiliate?: AffiliateLink;
  policy?: AffiliatePolicy;
  pastPosts: SimilarityCandidate[];
  /** Slackで本人が入力した、今回の投稿だけに使う見解 */
  authorViewpoint?: string;
};

export type GenerateNoteResult = {
  article?: NoteArticleDraft;
  warning?: string;
  error?: string;
};

/**
 * 有料note候補にしてよいか。
 * 「リンクを見るだけ」の記事は有料にしない。
 */
export function canBePaid(experiences: ExperienceEntry[]): boolean {
  return experiences.some(
    (e) =>
      e.verifiedByUser &&
      (Boolean(e.whatWasTried) || Boolean(e.whatDidNotWork) || e.reusableFacts.length > 0)
  );
}

export async function generateNoteArticle(
  input: GenerateNoteInput
): Promise<GenerateNoteResult> {
  const { cluster, items, experiences, brand, genre, articleType, affiliate, policy } = input;

  if (articleType === "paid" && !canBePaid(experiences)) {
    return {
      error:
        "有料noteにできる材料がありません。本人確認済みの実践内容（試したこと・失敗・再利用できる手順）が必要です",
    };
  }

  const canUseAffiliate = Boolean(
    affiliate?.url &&
      policy?.allowedChannels.includes(articleType === "paid" ? "note-paid" : "note-free") &&
      (articleType !== "paid" || policy?.paidNoteAllowed)
  );

  const structure =
    articleType === "paid"
      ? `## 構成（有料）
無料パート: 悩みへの共感 → 全体像 → 無料で出し切る手順の一部
有料パート: 実際の設定・テンプレート・プロンプト・失敗と対処・チェックリスト
有料パートは「読者が再利用できる成果物」を必ず含めること。`
      : `## 構成（無料）
1. 読者の悩み・疑問
2. なぜ今この話題なのか
3. 初心者向けの背景説明
4. まえみちとしての考え
5. 登録済みの体験・事実（無ければ体験を創作しない）
6. 失敗・迷い・注意点
7. 今日からできること
8. まとめ
9. 関連記事（登録URLが無ければURLを作らない）
X投稿を単純に長文化せず、noteとして独立した価値を持たせること。`;

  const prompt = `あなたは「${brand.identity.name}」のnote記事を書くライターです。

${brandBlock(brand)}

${trendBlock(cluster, items)}

${experienceBlock(experiences)}

${viewpointBlock(input.authorViewpoint)}

${structure}

## ジャンル
${genre.label}（${genre.description}）

${
  canUseAffiliate
    ? `## 使ってよいリンク
- ${affiliate!.serviceName}: ${affiliate!.url}（${affiliate!.ctaText}）
使う場合、記事冒頭に「${policy!.disclosureTextNote}」を必ず置く。
${policy!.claimRestrictions.length > 0 ? `禁止訴求: ${policy!.claimRestrictions.join(" / ")}` : ""}
サービスを実際に使っていない場合、使ったように書かないこと。`
    : "## リンク\nこの記事にアフィリエイトリンクは入れません。**URLを書かないでください。**"
}

# 厳守事項
1. 他者の文章を写さない・言い換えない
2. 登録された体験に無いことを「やった」と書かない
3. 「筆者が語れる根拠」に無い数字・成果を書かない
4. 読者が今日試せる具体的な行動を必ず1つ入れる
5. 煽らない。断定しない。上から教えない

# 出力（JSONのみ）
{
  "title": "記事タイトル",
  "subtitle": "サブタイトル（任意）",
  "freeSection": "無料で読める本文（Markdown）",
  ${articleType === "paid" ? '"paidSection": "有料パート本文（Markdown）",\n  "paywallAfterHeading": "有料の境界にする見出し",\n  ' : ""}"tags": ["タグ", "タグ"]
}`;

  const message = `【テーマ】${cluster.title}
【読者の悩み】${cluster.summary}
【記事種別】${articleType}`;

  let parsed: {
    title?: string;
    subtitle?: string;
    freeSection?: string;
    paidSection?: string;
    paywallAfterHeading?: string;
    tags?: string[];
  } = {};

  try {
    const response = await callAI(message, prompt, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return { error: "生成に失敗しました。もう一度お試しください" };
    parsed = JSON.parse(match[0]);
  } catch (error) {
    console.error("[note/generate] note記事の生成に失敗:", error);
    return { error: "生成に失敗しました。もう一度お試しください" };
  }

  if (!parsed.title || !parsed.freeSection) {
    return { error: "生成結果が不完全でした。もう一度お試しください" };
  }

  const allowedUrls = new Set(canUseAffiliate ? [affiliate!.url] : []);
  const scrub = (text: string): { text: string; used: boolean } => {
    let out = text;
    let used = false;
    for (const url of text.match(/https?:\/\/[^\s)\]"'）]+/g) ?? []) {
      if (allowedUrls.has(url)) used = true;
      else {
        console.warn(`[note/generate] 記事から未登録URLを除去: ${url}`);
        out = out.split(url).join("（リンク未登録）");
      }
    }
    return { text: out, used };
  };

  const free = scrub(String(parsed.freeSection));
  const paid = parsed.paidSection ? scrub(String(parsed.paidSection)) : null;
  const usedAffiliate = free.used || Boolean(paid?.used);

  let freeSection = free.text;
  const disclosure = policy?.disclosureTextNote ?? "※本記事にはプロモーションが含まれます";
  if (usedAffiliate && !freeSection.includes("プロモーション")) {
    freeSection = `${disclosure}\n\n${freeSection}`;
  }

  const similarity = checkSimilarity(
    freeSection,
    items.map((i) => ({ label: i.sourceUrl, text: i.textExcerpt })),
    input.pastPosts
  );

  const now = new Date().toISOString();
  const article: NoteArticleDraft = {
    id: hashId("n", `${cluster.id}${parsed.title}${now}`),
    title: String(parsed.title),
    subtitle: parsed.subtitle ? String(parsed.subtitle) : undefined,
    articleType,
    freeSection,
    paidSection: paid?.text,
    paywallAfterHeading: parsed.paywallAfterHeading,
    // 価格は人が決める。AIには決めさせない
    price: undefined,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 8) : [genre.label],
    affiliateIds: usedAffiliate && affiliate ? [affiliate.id] : [],
    needsDisclosure: usedAffiliate,
    sourceResearchItemIds: items.map((i) => i.id),
    sourceExperienceIds: experiences.map((e) => e.id),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  const warnings = [
    experiences.length === 0
      ? "登録済みの体験が無いため、一般的な考察として生成しました"
      : "",
    similarity.blocked ? `類似チェック: ${similarity.reason}（${similarity.similarTo}）` : "",
    articleType === "paid" ? "価格と有料の境界は人が確認してから設定してください" : "",
  ].filter(Boolean);

  return { article, warning: warnings.join(" / ") || undefined };
}
