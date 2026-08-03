/**
 * リサーチ結果のジャンル推定。
 *
 * 単に「AI」「本」を含むだけでは誤判定しやすいため、具体的な文脈を優先する。
 * 特にギャンブル記事の「AI予想」「投資」という表現を、AI・資産形成として扱わない。
 */

const EXCLUDED_CONTEXT =
  /競艇|競馬|パチンコ|スロット|オンラインカジノ|コロガシ|馬券|舟券/;

export function detectGenres(text: string): string[] {
  const normalized = text.normalize("NFKC");
  const hits: string[] = [];

  const table: Record<string, RegExp> = {
    ai: /ChatGPT|Claude|Gemini|生成AI|プロンプト|自動化|LLM|人工知能|AI(?:ツール|活用|開発|仕事|業務|学習|文章|画像|議事録)/i,
    "side-business": /副業|複業|個人開発|マネタイズ|フリーランス|受注/,
    reading: /読書|書評|要約|積読|読了|一冊|書籍/,
    "asset-building": /資産形成|資産運用|投資信託|個別株|NISA|積立|家計|貯金|株式/,
    habits: /習慣|継続|ルーティン|朝活|時間術|生産性/,
  };

  const excluded = EXCLUDED_CONTEXT.test(normalized);
  for (const [genreId, pattern] of Object.entries(table)) {
    if (excluded && (genreId === "ai" || genreId === "asset-building")) continue;
    if (pattern.test(normalized)) hits.push(genreId);
  }
  return hits;
}
