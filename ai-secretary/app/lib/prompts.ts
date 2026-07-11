import { SecretaryMode } from "./config/modes";
export type { SecretaryMode };

// --- Phase Foundation cleanup (2026-07-09) ---
// このファイルはかつて PERSONAL_PROMPT/COMPANY_PROMPT/FINANCE_PROMPT/NOTE_PROMPT という
// モード別プロンプト定数と、それを束ねる SYSTEM_PROMPTS / getSystemPrompt() を持っていたが、
// 実際のチャット生成ロジック（app/api/chat/route.ts）からは一度も呼ばれていない未使用コードだった
// （grep で自己参照以外の呼び出し元なしを確認済み）ため削除した。
// 実運用のプロンプトは app/lib/config/departments.ts の Secretary.prompt（秘書別・16体）が正。
// 旧NOTE_PROMPTにあった単価区分・曜日ローテーション等の内容は、現行の
// memory/personal/note/{monetization,hooks,themes}.md がより新しい実データとして
// 上位互換の内容を持っているため、削除しても情報の欠落はないことを確認した。
//
// SECRETARY_LABELS / SECRETARY_DESCRIPTIONS / SecretaryMode は app/page.tsx のモード選択UIで
// 現在も使われているため、このファイルはそれらの置き場として維持する。

export const SECRETARY_LABELS: Record<SecretaryMode, string> = {
  personal: "Personal 秘書",
  company: "Company 秘書",
  finance: "Finance 秘書",
  note: "Note Secretary",
};

export const SECRETARY_DESCRIPTIONS: Record<SecretaryMode, string> = {
  personal: "日々のタスク・健康・習慣化サポート",
  company: "事業戦略・KPI・意思決定の壁打ち",
  finance: "資産運用・ポートフォリオ・投資戦略のサポート",
  note: "note収益化（高単価アフィリ設計）",
};
