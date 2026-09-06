/** 店名の正規化。NFKCで半角カナ・全角英数を吸収し、記号/数字/店舗接尾辞を除去 */
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[0-9]+/g, "")
    .replace(/[\s　]/g, "")
    .replace(/["'#*./\-_,()（）\[\]［］|]/g, "")
    .replace(/(店|支店|ストア|store|co\.?,?\s*ltd\.?|株式会社|㈱)$/i, "")
    .toLowerCase()
    .trim();
}
