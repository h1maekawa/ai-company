import { NextRequest, NextResponse } from "next/server";
import { callOllama } from "@/app/lib/ai/ollama";
import { callGemini } from "@/app/lib/ai/gemini";
import { callGroq } from "@/app/lib/ai/groq";
import { findSecretary } from "@/app/lib/config/registry";
import { loadScopedMemory } from "@/app/lib/memory/loader";
import {
  switchSecretary,
  pushDecision,
  pushTask,
  ContextBus
} from "@/app/lib/context/bus";
import { loadBus, saveBus } from "@/app/lib/context/bus-server";
import { routeRequest } from "@/app/lib/router/executive";
import { parseSaveSuggestion } from "@/app/lib/parser/saveSuggestion";
import { saveChatLog } from "@/app/lib/memory/logs";
import { saveVaultFile } from "@/app/lib/vault";

// ─── ルーティング判定 ──────────────────────────────────
function shouldUseGemini(message: string): boolean {
  const geminiKeywords = [
    "最新", "ニュース", "今日の", "現在", "リアルタイム",
    "調査", "検索", "トレンド", "流行", "今週", "最近",
  ];
  return geminiKeywords.some((kw) => message.includes(kw));
}

// ─── FlowMap 保存 ────────────────────────────────────
async function saveFlowMapLog(flow: string[]) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateHyphen = `${year}-${month}-${day}`;
  const path = `memory/flow-map/${dateHyphen}.md`;

  const content = `---
type: flow_map
date: ${dateHyphen}
flow:
${flow.map(f => `  - ${f}`).join("\n")}
---
`;
  try {
    await saveVaultFile(path, content);
  } catch (e) {
    console.error("[DEBUG] Failed to save flow map log:", e);
  }
}

export async function GET() {
  const bus = await loadBus();
  return NextResponse.json({ currentBus: bus });
}

// ─── メインハンドラー ──────────────────────────────────
export async function POST(req: NextRequest) {
  const { message, provider, secretaryId } = (await req.json()) as {
    message?: string;
    provider?: "ollama" | "gemini" | "groq" | "auto";
    secretaryId?: string;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "メッセージが空です" }, { status: 400 });
  }

  // 1. Load Context Bus
  let bus = await loadBus();

  let routeTo: string | undefined = undefined;
  let confidence: number | undefined = undefined;
  let recommendedNext: string | undefined = undefined;
  let targetSecId = secretaryId || "executive-router";

  // 2. Executive Routing Logic
  if (targetSecId === "executive-router") {
    const routingResult = await routeRequest(message);
    confidence = routingResult.confidence;

    if (confidence >= 0.8) {
      // Automatic routing
      routeTo = routingResult.secretary;
      targetSecId = routingResult.secretary;
      bus = switchSecretary(
        bus,
        routingResult.secretary,
        `自動ルーティング（意図: ${routingResult.intent}, 確信度: ${routingResult.confidence}）`
      );
    } else if (confidence >= 0.5) {
      // Proposal only
      recommendedNext = routingResult.secretary;
      targetSecId = "executive-coo";
      bus = switchSecretary(
        bus,
        "executive-coo",
        `ルーティング提案（候補: ${routingResult.secretary}, 確信度: ${routingResult.confidence}）`
      );
    } else {
      // COO Questions back
      targetSecId = "executive-coo";
      bus = switchSecretary(
        bus,
        "executive-coo",
        `確信度低いためCOO対応（確信度: ${routingResult.confidence}）`
      );
    }
  } else {
    // Direct or manual selection
    if (targetSecId !== bus.activeSecretary) {
      bus = switchSecretary(bus, targetSecId, "手動選択による切り替え");
    }
  }

  // 3. Look up secretary in registry
  const registryEntry = findSecretary(targetSecId);
  if (!registryEntry) {
    return NextResponse.json({ error: `秘書定義が見つかりません: ${targetSecId}` }, { status: 404 });
  }

  // 4. Load Scoped Memory
  let memoryText = "";
  try {
    const { files } = await loadScopedMemory(targetSecId);
    memoryText = files
      .map((f) => `=== [MEMORY] ${f.path.split("/").pop()} ===\n${f.content.trim()}`)
      .join("\n\n");
  } catch (e) {
    console.error("[DEBUG] Scoped memory load failed:", e);
  }

  // 5. Build system prompt
  const busContext = `
---
## 会話共有コンテキスト（Context Bus）
現在の意図 (Intent): ${bus.currentIntent || "未設定"}
現在の目標 (Goal): ${bus.currentGoal || "未設定"}
担当部署: ${bus.activeDepartment}
現在のアクティブ秘書: ${registryEntry.config.name} (${targetSecId})
直前の秘書: ${bus.previousSecretary || "なし"}

### 決定履歴 (Decision History):
${bus.decisionHistory.slice(-5).map(h => `- [${h.timestamp}] ${h.from} → ${h.to} (理由: ${h.reason})`).join("\n")}

### タスクパイプライン (Task Pipeline):
${bus.taskPipeline.map(t => `- [${t.status}] ${t.title} (担当: ${t.owner}) (ID: ${t.id})`).join("\n")}
---
`;

  const saveInstruction = `
---
## 会話の保存判定ルール
今回の会話が「戦略設計、営業改善、仮説整理、意思決定、学び、失敗分析、コンテンツ設計、投資分析、業務改善」のいずれかに該当し、ナレッジとして保存する価値があるか判定してください。
保存する価値があると判断した場合、回答の最後に以下のHTMLコメント形式で、1行のメタデータを必ず追加してください（カテゴリ、スラグ、重要度を選択）。
保存価値がない場合は、何も追加しないでください。

<!-- SAVE_SUGGESTION: {
  "suggestSave": true,
  "category": "sales | marketing | recruiting | investing | systems | content | strategy | misc",
  "slug": "推奨されるファイル名用英数字スラグ（日本語不可、小文字、英数字とハイフンのみ）",
  "importance": 1-3
} -->
`;

  const busUpdateInstruction = `
---
## コンテキストバス更新ルール
今回の対話で「目標（currentGoal）」、「ユーザーの意図（currentIntent）」、または「タスク（taskPipeline）」に変化や追加があった場合、回答の最後に以下のHTMLコメント形式で、1行の更新指示を必ず追加してください。
また、もしCOOから専門秘書への自動遷移などの推薦を行うべき状況であれば、"routeTo"フィールドで遷移先を推薦してください。

<!-- BUS_UPDATE: {
  "currentIntent": "新しい意図（変更があった場合のみ）",
  "currentGoal": "新しい目標（変更があった場合のみ）",
  "newTask": { "id": "新規タスクID(例: tk-001)", "title": "タスク名", "owner": "担当秘書ID", "status": "pending | in_progress | done" },
  "routeTo": "遷移先の秘書ID"
} -->
`;

  let systemPrompt = `
${registryEntry.config.prompt}

${busContext}
`;

  if (memoryText) {
    systemPrompt += `
---
## あなたが把握しているユーザー情報（自動読み込みメモリ）
${memoryText}
---
`;
  }

  systemPrompt += `
${saveInstruction}
${busUpdateInstruction}
`;

  // 6. Provider selection
  let selectedProvider: "ollama" | "gemini" | "groq" = "groq";
  if (provider === "ollama") selectedProvider = "ollama";
  else if (provider === "gemini") selectedProvider = "gemini";
  else if (provider === "groq") selectedProvider = "groq";
  else if (provider === "auto") {
    selectedProvider = shouldUseGemini(message) ? "gemini" : "groq";
  }

  try {
    let rawReply: string;
    if (selectedProvider === "gemini") {
      rawReply = await callGemini(message, systemPrompt);
    } else if (selectedProvider === "groq") {
      rawReply = await callGroq(message, systemPrompt);
    } else {
      try {
        rawReply = await callOllama(message, systemPrompt);
      } catch (ollamaErr) {
        console.warn("[WARNING] Ollama call failed. Falling back to Groq:", ollamaErr);
        selectedProvider = "groq";
        rawReply = await callGroq(message, systemPrompt);
      }
    }

    // 7. Parse meta annotations
    const parsedSuggestion = parseSaveSuggestion(message, rawReply);
    
    // Parse Context Bus updates
    const busUpdateMatch = rawReply.match(/<!-- BUS_UPDATE: (\{[\s\S]*?\}) -->/);
    if (busUpdateMatch) {
      try {
        const updates = JSON.parse(busUpdateMatch[1]);
        if (updates.currentIntent) bus.currentIntent = updates.currentIntent;
        if (updates.currentGoal) bus.currentGoal = updates.currentGoal;
        if (updates.newTask) {
          bus = pushTask(bus, {
            id: updates.newTask.id || `tk-${Date.now()}`,
            title: updates.newTask.title,
            owner: updates.newTask.owner || targetSecId,
            status: updates.newTask.status || "pending"
          });
        }
        if (updates.routeTo && findSecretary(updates.routeTo)) {
          routeTo = updates.routeTo;
          bus = switchSecretary(bus, updates.routeTo, `AI自立型推薦による遷移`);
        }
      } catch (e) {
        console.error("[DEBUG] Failed to parse BUS_UPDATE JSON:", e);
      }
    }

    // Clean metadata tags from reply
    let cleanReply = parsedSuggestion.replyWithoutMetadata;
    cleanReply = cleanReply.replace(/<!-- BUS_UPDATE: [\s\S]*? -->/g, "").trim();

    // 8. Background logging
    saveChatLog(targetSecId, message, cleanReply).catch((err) => {
      console.error("[DEBUG] Background saveChatLog failed:", err);
    });

    // Save FlowMap Log
    const flow = [...bus.decisionHistory.map(d => d.to), targetSecId];
    await saveFlowMapLog(flow);

    // Save Context Bus back to file
    await saveBus(bus);

    return NextResponse.json({
      reply: cleanReply,
      suggestSave: parsedSuggestion.suggestSave,
      routeTo,
      confidence,
      flow,
      activeAuthority: registryEntry.config.authority || "",
      currentBus: bus,
      recommendedNext,
      provider: selectedProvider,
      secretaryId: targetSecId
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}