/**
 * Style Profile の型と表示用定数（I/Oを持たない）。
 *
 * styleProfile.ts は Vault（fs）に依存するため、クライアントコンポーネントから
 * 直接importできない。画面が必要とする型・ラベル・次元の並びだけをここへ置く。
 */

export type StyleFieldSource =
  | "manual"
  | "own-posts"
  | "performance"
  | "external-pattern"
  | "unset";

export type StyleField = {
  description: string;
  source: StyleFieldSource;
  updatedAt: string;
};

/** 学習対象の文体次元。UIの並び順もこれを正とする */
export const STYLE_DIMENSIONS = [
  "opening",
  "ending",
  "tone",
  "sentenceLength",
  "lineBreak",
  "question",
  "cta",
] as const;

export type StyleDimension = (typeof STYLE_DIMENSIONS)[number];

export const STYLE_DIMENSION_LABELS: Record<StyleDimension, string> = {
  opening: "書き出し",
  ending: "締め",
  tone: "トーン",
  sentenceLength: "文の長さ",
  lineBreak: "改行",
  question: "問いかけ",
  cta: "導線(CTA)",
};

export const STYLE_SOURCE_LABELS: Record<StyleFieldSource, string> = {
  manual: "本人が指定",
  "own-posts": "本人の投稿から学習",
  performance: "実績から学習",
  "external-pattern": "外部の型",
  unset: "未学習",
};

export type StyleProfile = {
  opening: StyleField;
  ending: StyleField;
  tone: StyleField;
  sentenceLength: StyleField;
  lineBreak: StyleField;
  question: StyleField;
  cta: StyleField;
  /** 本人が明示的に登録した表現のみ。外部投稿からの自動抽出はしない */
  preferredExpressions: string[];
  avoidedExpressions: string[];
  updatedAt: string;
};

/** 何を材料に学習しているかの内訳（要件4の「種が入っているか」表示） */
export type StyleLearningSources = {
  /** システム生成で実際に使われた投稿の件数 */
  drafts: number;
  /** うち本人が編集したもの（重み2） */
  editedByUser: number;
  /** 本人のX過去投稿（アーカイブ・手動登録）の件数 */
  archive: number;
  /** 実績レコードの件数 */
  performance: number;
  /** 本人が明示的に指定したフィールド数（自動学習で上書きされない） */
  manualFields: number;
  /** 種が入っているか。false なら学習の初期精度が出ない */
  seeded: boolean;
};
