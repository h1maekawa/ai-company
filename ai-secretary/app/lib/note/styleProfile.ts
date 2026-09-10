/**
 * Personal Style Profile（要件P0.1〜P0.3）。
 *
 * 投稿生成時に使う「本人らしさ」の型。優先順位は
 *   Brand > Safety > 本人明示Style(manual) > 本人既存投稿(own-posts) > 自分のPerformance(performance) > 外部Winning Pattern(external-pattern)
 * source==="manual" のフィールドは自動更新（own-posts/performance由来の再計算）で絶対に上書きしない。
 * 外部X投稿の特徴的な表現はそのまま保存しない（保存するのは抽象化した型の説明だけ）。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import { classifyStyle, aggregateStyleSignals, type StyleDimensionKey, type StyleSignalGroup } from "./styleSignals";
import type { OwnedXPost } from "./x/types";
import type { ContentPerformance, PerformanceWeights, SocialDraft } from "./research/types";

const PATH = "memory/personal/note/style-profile.md";

export type {
  StyleFieldSource,
  StyleField,
  StyleDimension,
  StyleProfile,
  StyleLearningSources,
} from "./styleProfileTypes";
export {
  STYLE_DIMENSIONS,
  STYLE_DIMENSION_LABELS,
  STYLE_SOURCE_LABELS,
} from "./styleProfileTypes";

import {
  STYLE_DIMENSIONS,
  type StyleField,
  type StyleLearningSources,
  type StyleProfile,
} from "./styleProfileTypes";

function unsetField(): StyleField {
  return { description: "", source: "unset", updatedAt: new Date().toISOString() };
}

export function defaultStyleProfile(): StyleProfile {
  return {
    opening: unsetField(),
    ending: unsetField(),
    tone: unsetField(),
    sentenceLength: unsetField(),
    lineBreak: unsetField(),
    question: unsetField(),
    cta: unsetField(),
    preferredExpressions: [],
    avoidedExpressions: [],
    updatedAt: new Date().toISOString(),
  };
}

/* ─── Vault保存 ───────────────────────────────────── */

export async function loadStyleProfile(): Promise<StyleProfile> {
  const defaults = defaultStyleProfile();
  try {
    const file = await getVaultFile(PATH);
    const match = (file.content || "").match(/```json\s*\n([\s\S]*?)\n```/);
    if (!match) return defaults;
    const data = JSON.parse(match[1]) as Partial<StyleProfile>;
    return {
      opening: { ...defaults.opening, ...data.opening },
      ending: { ...defaults.ending, ...data.ending },
      tone: { ...defaults.tone, ...data.tone },
      sentenceLength: { ...defaults.sentenceLength, ...data.sentenceLength },
      lineBreak: { ...defaults.lineBreak, ...data.lineBreak },
      question: { ...defaults.question, ...data.question },
      cta: { ...defaults.cta, ...data.cta },
      preferredExpressions: Array.isArray(data.preferredExpressions) ? data.preferredExpressions : [],
      avoidedExpressions: Array.isArray(data.avoidedExpressions) ? data.avoidedExpressions : [],
      updatedAt: data.updatedAt ?? defaults.updatedAt,
    };
  } catch {
    return defaults;
  }
}

export async function saveStyleProfile(profile: StyleProfile): Promise<StyleProfile> {
  const next: StyleProfile = { ...profile, updatedAt: new Date().toISOString() };
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(PATH)).sha;
  } catch {
    // 初回作成
  }

  const line = (label: string, field: StyleField) =>
    `- **${label}**: ${field.description || "（未設定）"}（source: ${field.source}）`;

  const markdown = `---
type: note_style_profile
updated: ${next.updatedAt}
---

# Personal Style Profile

投稿生成時に使うStyle Profileです。優先順位は
**Brand > Safety > 本人明示Style(manual) > 本人既存投稿(own-posts) > 自分のPerformance(performance) > 外部Winning Pattern(external-pattern)**。
source: manual のフィールドは自動学習で上書きされません。外部投稿の特徴的な表現はそのまま保存しません。

${line("Opening", next.opening)}
${line("Ending", next.ending)}
${line("Tone", next.tone)}
${line("Sentence Length", next.sentenceLength)}
${line("Line Break", next.lineBreak)}
${line("Question", next.question)}
${line("CTA", next.cta)}

## Preferred Expressions
${next.preferredExpressions.length > 0 ? next.preferredExpressions.map((e) => `- ${e}`).join("\n") : "- （未設定）"}

## Avoided Expressions
${next.avoidedExpressions.length > 0 ? next.avoidedExpressions.map((e) => `- ${e}`).join("\n") : "- （未設定）"}

\`\`\`json
${JSON.stringify(next, null, 2)}
\`\`\`
`;
  await saveVaultFile(PATH, markdown, sha);
  return next;
}

/* ─── バケット値 → 自然文の説明 ───────────────────── */

const BUCKET_DESCRIPTIONS: Record<string, string> = {
  question: "冒頭または末尾を問いかけにする",
  "number-lead": "冒頭を数字から始める",
  "short-hook": "冒頭を短い一言のフックにする",
  statement: "冒頭を状況説明の一文から始める",
  "open-ended": "結論を急がず、余韻や迷いを残して終える",
  resolved: "考えをまとめて終える",
  dense: "段落を詰め気味に書く（改行少なめ）",
  spaced: "段落の間を広めに取る（改行多め）",
  single: "改行を最小限にする",
  short: "一文を短く保つ",
  medium: "一文の長さは標準的にする",
  long: "一文がやや長くなってもよい",
  "no-question": "問いかけを使わない",
  cta: "note等への導線（CTA）を入れる",
  "no-cta": "CTAを入れない",
  opinion: "意見をはっきり述べるトーン",
  reflection: "内省的に振り返るトーン",
  conversation: "会話するような柔らかいトーン",
  daily: "日常をそのまま記録するトーン",
  tried: "実践記録のトーン",
  save: "要点を整理して伝えるトーン",
  "note-link": "note誘導を意識したトーン",
};

/* ─── 本人既存投稿からの学習（要件P0.1・P0.3） ─────────── */

type OwnPostsSignal = { value: string; weight: number };
type OwnPostsProfile = Partial<
  Record<"opening" | "ending" | "sentenceLength" | "lineBreak" | "question" | "cta" | "tone", OwnPostsSignal>
>;

/**
 * 実際に使われた（draft/discarded以外の）本人の過去投稿から、次元ごとの優勢な型を求める。
 * 本人がREVIEWモードで編集した投稿（editedByUser）は「強い学習材料」として2倍の重みを持つ（要件P0.3）。
 * 外部投稿は対象にしない（本人自身の投稿のみ）。
 */
/**
 * 学習に使う投稿を正規化した形。
 * システムが生成した下書きと、本人が実際にXへ投稿した過去ログ（アーカイブ）の
 * 両方を同じ集計に流すために挟む。
 */
export type StyleLearningPost = {
  text: string;
  /** 学習の重み。本人の手が入っているものほど強い */
  weight: number;
  /** CTA判定に使う。下書き以外は本文から判断できないため任意 */
  hasCta?: boolean;
  /** トーン。下書きのpatternに相当。無ければトーンの集計に寄与しない */
  tone?: string;
};

/** SocialDraft（システム生成・使用済み）を学習入力へ */
export function draftsToLearningPosts(drafts: SocialDraft[]): StyleLearningPost[] {
  return drafts
    .filter((d) => d.status !== "draft" && d.status !== "discarded" && d.text.trim())
    .map((draft) => ({
      text: draft.text,
      // 本人がREVIEWモードで手を入れた投稿は「強い学習材料」（要件P0.3）
      weight: draft.editedByUser ? 2 : 1,
      hasCta:
        draft.urls.length > 0 ||
        draft.purpose === "note-bridge" ||
        draft.purpose === "affiliate",
      tone: draft.pattern,
    }));
}

/**
 * 本人のX過去投稿（アーカイブ取込・手動登録）を学習入力へ。
 *
 * source が "ai-secretary" のものは除外する。
 * それはこのシステムが生成した投稿で、drafts 側にも入っているため、
 * 含めると AI が自分の出力から学ぶ循環になり、本人の文体から離れていく。
 *
 * 重みは2。本文を100%本人が書いているので、
 * 「AIの下書きを本人が編集したもの」と同等以上の強さで扱う。
 */
export function ownedPostsToLearningPosts(posts: OwnedXPost[]): StyleLearningPost[] {
  return posts
    .filter((post) => post.source !== "ai-secretary" && post.text.trim())
    .map((post) => ({ text: post.text, weight: 2 }));
}

/** 正規化済みの投稿群から、次元ごとの優勢な型を求める */
export function deriveStyleFromLearningPosts(posts: StyleLearningPost[]): OwnPostsProfile {
  if (posts.length === 0) return {};

  const tallies: Record<string, Map<string, number>> = {
    opening: new Map(), ending: new Map(), sentenceLength: new Map(),
    lineBreak: new Map(), question: new Map(), cta: new Map(), tone: new Map(),
  };

  for (const post of posts) {
    const style = classifyStyle(post.text);
    const weight = post.weight;
    const add = (dim: string, value: string) => tallies[dim].set(value, (tallies[dim].get(value) ?? 0) + weight);
    add("opening", style.openingBucket);
    add("ending", style.endingBucket);
    add("sentenceLength", style.sentenceLengthBucket);
    add("lineBreak", style.lineBreakBucket);
    add("question", style.hasQuestion ? "question" : "no-question");
    // CTAの有無が判定できない材料（アーカイブ）はCTA次元に寄与させない
    if (post.hasCta !== undefined) add("cta", post.hasCta ? "cta" : "no-cta");
    if (post.tone) add("tone", post.tone);
  }

  const result: OwnPostsProfile = {};
  for (const dim of ["opening", "ending", "sentenceLength", "lineBreak", "question", "cta", "tone"] as const) {
    const top = [...tallies[dim].entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) result[dim] = { value: top[0], weight: top[1] };
  }
  return result;
}

/**
 * 実際に使われた（draft/discarded以外の）本人の過去投稿から、次元ごとの優勢な型を求める。
 * 既存の呼び出しを壊さないための薄いラッパー。
 */
export function deriveStyleFromOwnPosts(drafts: SocialDraft[]): OwnPostsProfile {
  return deriveStyleFromLearningPosts(draftsToLearningPosts(drafts));
}

/* ─── 学習の合成（Performance優先、本人明示Styleは不可侵） ─── */

function resolveField(
  current: StyleField,
  performanceWinner: StyleSignalGroup | undefined,
  ownPosts: OwnPostsSignal | undefined
): StyleField {
  if (current.source === "manual") return current;
  const now = new Date().toISOString();
  if (performanceWinner) {
    return {
      description: BUCKET_DESCRIPTIONS[performanceWinner.value] ?? performanceWinner.value,
      source: "performance",
      updatedAt: now,
    };
  }
  if (ownPosts) {
    return { description: BUCKET_DESCRIPTIONS[ownPosts.value] ?? ownPosts.value, source: "own-posts", updatedAt: now };
  }
  // データ不足の次元は前回値を維持する（推測で埋めない）
  return current;
}

/**
 * Style Profileへ学習結果を合成する（純粋関数。保存はしない）。
 * AIがPerformanceだけを理由にBrandの根本人格を変更することはない
 * （StyleProfileはBrand/Safetyより下位で参照されるだけで、Brand自体は一切変更しない）。
 */
export function computeLearnedStyleProfile(
  current: StyleProfile,
  drafts: SocialDraft[],
  performanceRecords: ContentPerformance[],
  weights: PerformanceWeights,
  /**
   * 本人のX過去投稿（アーカイブ取込）。省略可。
   * 渡すと「種入れ」が効き、下書きが少ない初期でも本人の文体に寄る。
   */
  archivePosts: OwnedXPost[] = []
): StyleProfile {
  const ownPosts = deriveStyleFromLearningPosts([
    ...draftsToLearningPosts(drafts),
    ...ownedPostsToLearningPosts(archivePosts),
  ]);
  const perfGroups = aggregateStyleSignals(performanceRecords, weights);
  const winnerFor = (dimension: StyleDimensionKey): StyleSignalGroup | undefined =>
    perfGroups.filter((g) => g.dimension === dimension && g.winning).sort((a, b) => b.averageScore - a.averageScore)[0];

  return {
    ...current,
    opening: resolveField(current.opening, winnerFor("openingBucket"), ownPosts.opening),
    ending: resolveField(current.ending, winnerFor("endingBucket"), ownPosts.ending),
    tone: resolveField(current.tone, winnerFor("pattern"), ownPosts.tone),
    sentenceLength: resolveField(current.sentenceLength, winnerFor("sentenceLengthBucket"), ownPosts.sentenceLength),
    lineBreak: resolveField(current.lineBreak, winnerFor("lineBreakBucket"), ownPosts.lineBreak),
    question: resolveField(current.question, winnerFor("question"), ownPosts.question),
    cta: resolveField(current.cta, winnerFor("cta"), ownPosts.cta),
    updatedAt: new Date().toISOString(),
  };
}

/* ─── 生成Promptへの反映 ───────────────────────────── */

/** Brand/Safetyより必ず下位に置くことを明示した上でStyle Profileを渡す */
export function styleProfileBlock(profile: StyleProfile): string {
  const fields = [
    ["Opening", profile.opening],
    ["Ending", profile.ending],
    ["Tone", profile.tone],
    ["Sentence Length", profile.sentenceLength],
    ["Line Break", profile.lineBreak],
    ["Question", profile.question],
    ["CTA", profile.cta],
  ] as const;
  const active = fields.filter(([, f]) => f.description);
  if (active.length === 0 && profile.preferredExpressions.length === 0 && profile.avoidedExpressions.length === 0) {
    return "";
  }
  return `## Personal Style Profile（参考情報。上のBrand/Safetyルールと矛盾する場合は必ずBrand/Safetyを優先する）
${active.map(([label, f]) => `- ${label}: ${f.description}`).join("\n") || "（学習途中で未設定）"}
${profile.preferredExpressions.length > 0 ? `- 使いたい表現の傾向: ${profile.preferredExpressions.join("、")}` : ""}
${profile.avoidedExpressions.length > 0 ? `- 避けたい表現の傾向: ${profile.avoidedExpressions.join("、")}` : ""}
このStyle Profileは本人の書き方の傾向であり、事実・ブランド人格・Safetyルールを変更する理由にはならない。`;
}

/* ─── 学習ソースの内訳（UI表示用） ─────────────────── */


/**
 * 何を材料に学習しているかを数える。
 * 「種が入っているか一目で分かる」ようにするための集計（TASK-N3 / 要件4）。
 */
export function summarizeLearningSources(input: {
  profile: StyleProfile;
  drafts: SocialDraft[];
  archivePosts: OwnedXPost[];
  performanceRecords: ContentPerformance[];
}): StyleLearningSources {
  const usable = draftsToLearningPosts(input.drafts);
  const archive = ownedPostsToLearningPosts(input.archivePosts);
  const manualFields = STYLE_DIMENSIONS.filter(
    (key) => input.profile[key].source === "manual"
  ).length;

  return {
    drafts: usable.length,
    editedByUser: input.drafts.filter((d) => d.editedByUser).length,
    archive: archive.length,
    performance: input.performanceRecords.length,
    manualFields,
    // 本人由来の材料（アーカイブ or 本人編集）が1件でもあれば種は入っている
    seeded: archive.length > 0 || input.drafts.some((d) => d.editedByUser),
  };
}
