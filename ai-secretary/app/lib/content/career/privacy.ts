import type { CareerRisk } from "./types";

const CHECKS: Array<[string, RegExp]> = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["phone", /(?:\+81[- ]?)?0\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}/],
  ["company", /(?:株式会社|有限会社|合同会社)[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9・]{2,30}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9・]{2,30}(?:株式会社|有限会社|合同会社|Inc\.?|Corp\.?)/u],
  ["school", /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9・]{2,30}(?:大学|大学院|高専|高等学校|高校)/u],
  ["identity_label", /(?:氏名|本名|フルネーム|学籍番号|社員番号|所属部署|勤務先|大学名|高校名|役職|研究室)\s*[:：]?\s*[^\s、。]{2,40}/u],
  ["named_person", /(?:^|[\s、。])([\p{Script=Han}]{1,4}\s?[\p{Script=Han}]{1,4})(?:さん|氏|くん|ちゃん)/u],
];
export type PrivacyCheck = { risk: CareerRisk; findings: string[] };
export function checkCareerPrivacy(text: string): PrivacyCheck {
  const findings = CHECKS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  return { risk: findings.length ? "review_required" : "clear", findings };
}

export function checkCareerFactuality(text: string): "clear" | "review_required" {
  return /(?:必ず|絶対|全員|内定率\s*\d|通過率\s*\d|合格率\s*\d|ランキング\s*\d)/u.test(text) ? "review_required" : "clear";
}
