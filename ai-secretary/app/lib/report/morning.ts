import { loadBus } from "../context/bus-server";
import { callGemini } from "../ai/gemini";
import { callGroq } from "../ai/groq";
import { getVaultFile, listVaultDirectory } from "../vault";

/**
 * Phase2 Foundation fix:
 * This module previously read memory files directly off the local filesystem via
 * `fs.readFileSync(resolveVaultPath(...))`. That path (`VAULT_ROOT`) only exists on the
 * developer's machine, so on Vercel (production) every read silently failed and the
 * Morning Report was generated with empty sections for positions/drafts/KPI/goals.
 *
 * Fix: route all reads through the same Vault abstraction (`vault.ts`) used by the rest
 * of the app (`/api/chat`, `/api/fund/*`, `/api/note/*`). `vault.ts` already implements
 * "GitHub Contents API in production, local filesystem fallback in development" — so by
 * using it here, local fs access becomes automatically dev-only, and production reads
 * work the same way chat-based memory loading already does (see `memory/loader.ts`).
 *
 * A missing file is not an error: `getVaultFile`/`listVaultDirectory` already return an
 * empty result in that case, and this module treats that as "なし" (same behavior as
 * before). The response shape of `generateMorningReport()` (a Markdown string) and the
 * `/api/report/morning` endpoint are unchanged.
 */

async function safeGetFile(path: string): Promise<string> {
  try {
    const { content } = await getVaultFile(path);
    return content || "";
  } catch (e) {
    console.error(`[Morning Engine] Failed to read ${path}:`, e);
    return "";
  }
}

async function safeListDirectory(path: string): Promise<string[]> {
  try {
    return await listVaultDirectory(path);
  } catch (e) {
    console.error(`[Morning Engine] Failed to list ${path}:`, e);
    return [];
  }
}

/**
 * Synthesizes inbox, tasks, positions, drafts, and goals to generate the daily Morning Report.
 */
export async function generateMorningReport(): Promise<string> {
  // 1. Load Context Bus
  const bus = await loadBus();
  const personalInbox = bus.personal?.inboxQueue || [];
  const personalTasks = bus.personal?.taskPipeline || [];
  const companyInbox = (bus.company?.inboxQueue || bus.crestix?.inboxQueue) || [];
  const companyTasks = (bus.company?.taskPipeline || bus.crestix?.taskPipeline) || [];

  // 2. Load Fund positions
  const positionsContent = await safeGetFile("memory/personal/fund/positions.md");

  // 3. Load Note drafts (list filenames only, same filter as before)
  const draftFiles = await safeListDirectory("memory/personal/note/drafts");
  const draftsList = draftFiles.filter((f) => f.endsWith(".md") && f !== "README.md");

  // 3c. Load Note KPI
  const noteKpiContent = await safeGetFile("memory/personal/note/kpi.md");

  // 3b. Load HD Business KPI + Pipeline
  const hdKpiContent = await safeGetFile("memory/company/hd-business/kpi.md");
  const hdPipelineContent = await safeGetFile("memory/company/hd-business/pipeline.md");

  // 4. Load Current goals (memory/personal/goals.md, falling back to memory/goals.md)
  let goalsContent = await safeGetFile("memory/personal/goals.md");
  if (!goalsContent) {
    goalsContent = await safeGetFile("memory/goals.md");
  }

  // Compile inputs
  const inboxText = [...personalInbox, ...companyInbox]
    .map(item => `- [${item.approvalStatus}] ${item.rawText} (Company: ${item.company || "personal"})`)
    .join("\n") || "なし";

  const tasksText = [...personalTasks, ...companyTasks]
    .map(t => `- [${t.status}] ${t.title} (担当: ${t.owner})`)
    .join("\n") || "なし";

  const draftsText = draftsList.length > 0 ? draftsList.map(d => `- ${d}`).join("\n") : "なし";

  const inputSummary = `
=== 1. インボックス収集内容 ===
${inboxText}

=== 2. タスクパイプライン ===
${tasksText}

=== 3. 保有ポジション状況 ===
${positionsContent || "なし"}

=== 4. Note下書きリスト ===
${draftsText}

=== 5. 現在の目標 ===
${goalsContent || "なし"}

=== 6. HD Business KPI・パイプライン状況 ===
KPI:
${hdKpiContent || "なし"}

パイプライン:
${hdPipelineContent || "なし"}
`;

  const systemPrompt = `
あなたは前川弘行専用の「朝会秘書」（personal-morning）であり、AI Holding OSの朝会レポート生成エンジンです。
提供されたインプットデータ（インボックス、タスク、保有株ポジション、note下書き状況、目標）をもとに、一日の作戦会議レポートを生成してください。

## 朝会レポートの必須出力フォーマット（厳守）
回答は必ず以下の項目で出力してください。感情的表現は禁止し、ロジカルでアクション可能な内容にしてください。

【今日やること】
（今日最優先で完了すべき具体的なオペレーションタスクや処理内容。インボックスの仕分けやタスク進行を踏まえて3〜5つ指定）

【最重要】
（本日の全体の意思決定・フォーカス事項における最重要課題）

【止まっていること】
（保留、またはボトルネックになっている事項、確認・判断が必要な進捗遅延タスク）

【投資注目】
（保有ポジション（positions.md）の株価推移や決算予定を踏まえ、本日注視すべきアラートや情報）

【note注目】
- 下書き一覧: ${draftsText}
- KPI状況: ${noteKpiContent ? noteKpiContent.split("\n").slice(0, 10).join("\n") : "未設定"}
（本日執筆すべきnoteのテーマ、投稿本数ペース評価、今週の優先アクション）

【HD営業進捗】
（HD BusinessのKPI進捗を踏まえ、今日の架電目標・アポ目標・着地予測の簡潔なサマリー。ボトルネックがある場合は最優先改善項目も記載）

【売上最大行動】
（中長期で売上・利益インパクトが最も大きい、本日必ず実行すべき経営・アライアンス・執筆などの決定的な一手）
`;

  try {
    return await callGemini(inputSummary, systemPrompt);
  } catch (e) {
    console.warn("[Morning Engine] Gemini call failed, falling back to Groq:", e);
    return await callGroq(inputSummary, systemPrompt);
  }
}
