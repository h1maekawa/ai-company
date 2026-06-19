import fs from "fs";
import path from "path";
import { loadBus } from "../context/bus-server";
import { callGemini } from "../ai/gemini";
import { callGroq } from "../ai/groq";
import { resolveVaultPath } from "../runtime/paths";

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
  let positionsContent = "";
  try {
    const pPath = resolveVaultPath("personal/fund/positions.md");
    if (fs.existsSync(pPath)) {
      positionsContent = fs.readFileSync(pPath, "utf-8");
    }
  } catch (e) {
    console.error("[Morning Engine] Failed to read positions.md:", e);
  }

  // 3. Load Note drafts
  let draftsList: string[] = [];
  try {
    const dPath = resolveVaultPath("personal/note/drafts");
    if (fs.existsSync(dPath)) {
      draftsList = fs.readdirSync(dPath).filter(f => f.endsWith(".md") && f !== "README.md");
    }
  } catch (e) {
    console.error("[Morning Engine] Failed to read note drafts:", e);
  }

  // 3b. Load HD Business KPI + Pipeline
  let hdKpiContent = "";
  let hdPipelineContent = "";
  try {
    const kpiPath = resolveVaultPath("company/hd-business/kpi.md");
    if (fs.existsSync(kpiPath)) {
      hdKpiContent = fs.readFileSync(kpiPath, "utf-8");
    }
    const pipePath = resolveVaultPath("company/hd-business/pipeline.md");
    if (fs.existsSync(pipePath)) {
      hdPipelineContent = fs.readFileSync(pipePath, "utf-8");
    }
  } catch (e) {
    console.error("[Morning Engine] Failed to read HD Business files:", e);
  }

  // 4. Load Current goals
  let goalsContent = "";
  try {
    const gPath = resolveVaultPath("personal/goals.md");
    const rootGPath = resolveVaultPath("goals.md");
    if (fs.existsSync(gPath)) {
      goalsContent = fs.readFileSync(gPath, "utf-8");
    } else if (fs.existsSync(rootGPath)) {
      goalsContent = fs.readFileSync(rootGPath, "utf-8");
    }
  } catch (e) {
    console.error("[Morning Engine] Failed to read goals:", e);
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
（下書きの進行状況を踏まえ、今日執筆・改善すべきnoteテーマやドラフト進捗計画）

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
