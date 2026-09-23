/**
 * Executive Router の Layer 1（決定的 Pre-Router、LLMなし）。
 *
 * キーワードはこのファイルの PRE_ROUTER_RULES だけに置く（各所へ散らさない）。
 * 優先順位は上から: 投資判断 → Content作成 → 家計 → 社内データ → Research。
 * 調査と判断が混ざった依頼（「分析して、買うべきか教えて」）は投資判断が先に当たり Fund Manager へ行く。
 * R&I は Trade / Publish へ handoff しないため、R&I 内の誤分類は Human Gate に影響しない。
 */
export type PreRouteTarget = "fund" | "creator" | "finance" | "research";

export const PRE_ROUTER_RULES: ReadonlyArray<{ target: PreRouteTarget | "internal"; patterns: RegExp[] }> = [
  {
    target: "fund",
    patterns: [/買うべき|買いたい|買って(?!い?る)|買い増し|買い時|売るべき|売りたい|売って(?!い?る)|売り時|利確|損切り|ポートフォリオ|集中リスク|ナンピン|ポジションを(?:見|確認)|\/fund-/u],
  },
  {
    target: "creator",
    patterns: [/作って|作成して|書いて|台本|投稿して|記事にして|下書きを|\/note-/u],
  },
  {
    target: "finance",
    patterns: [/家計|支出|キャッシュフロー|収支|予算/u],
  },
  {
    // 社内データの確認は外部Researchではない。既存Executive分類へ戻す
    target: "internal",
    patterns: [/kpi|実績|タスク|やること|今日の予定|朝会|モーニングレポート|壁打ち/iu],
  },
  {
    target: "research",
    patterns: [/分析して|調べて|リサーチ|調査して|どんな会社|何(?:を)?して(?:い)?る会社|とは何|伸びる|伸びて|不足|ボトルネック|value\s*chain|バリューチェーン|トレンド|市場規模|需要は|今後どうなる/iu],
  },
];

/** 該当すれば行き先、該当しなければ null（既存Executive分類を使う）。 */
export function preRoute(message: string): PreRouteTarget | null {
  const text = (message ?? "").trim();
  if (!text) return null;
  for (const rule of PRE_ROUTER_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.target === "internal" ? null : rule.target;
  }
  return null;
}

/** Layer 1 で確定した行き先の既存AI社員。R&I は社員ではなく Research Platform なので含めない。 */
export const PRE_ROUTE_SECRETARY: Record<Exclude<PreRouteTarget, "research">, { secretary: string; department: string; room?: string; intent: string }> = {
  fund: { secretary: "personal-fund", department: "personal", room: "personal-fund-room", intent: "投資判断サポート" },
  creator: { secretary: "personal-note", department: "personal", intent: "Content作成" },
  finance: { secretary: "personal-finance", department: "personal", intent: "家計・資金" },
};
