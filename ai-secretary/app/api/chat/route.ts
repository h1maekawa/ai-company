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
  ContextBus,
  getActiveBus,
  DecisionNode,
  TaskNode
} from "@/app/lib/context/bus";
import { loadBus, saveBus } from "@/app/lib/context/bus-server";
import { routeRequest } from "@/app/lib/router/executive";
import { parseSaveSuggestion } from "@/app/lib/parser/saveSuggestion";
import { saveChatLog } from "@/app/lib/memory/logs";
import { saveVaultFile } from "@/app/lib/vault";
import { classifyInbox } from "@/app/lib/router/inbox";
import { processInboxApproval, InboxApprovePayload } from "@/app/lib/pipeline/inboxPipeline";
import { saveCaptureEvent } from "@/app/lib/memory/capture";
import { addToInboxQueue } from "@/app/lib/pipeline/inboxQueue";

// ─── ルーティング判定 ──────────────────────────────────
function shouldUseGemini(message: string): boolean {
  const geminiKeywords = [
    "最新", "ニュース", "今日の", "現在", "リアルタイム",
    "調査", "検索", "トレンド", "流行", "今週", "最近",
  ];
  return geminiKeywords.some((kw) => message.includes(kw));
}

// ─── Fund コマンド検出 ──────────────────────────────────
const FUND_COMMANDS = [
  "/fund-review", "/market-scan", "/earnings-check",
  "/rotation-check", "/buy-signal", "/sell-signal",
  "/risk-check", "/portfolio-review", "/fund-heatmap"
] as const;
type FundCommand = typeof FUND_COMMANDS[number];

function detectFundCommand(message: string): FundCommand | null {
  for (const cmd of FUND_COMMANDS) {
    if (message.startsWith(cmd) || message.includes(cmd)) return cmd;
  }
  return null;
}

// ─── Note コマンド検出 ──────────────────────────────────
const NOTE_COMMANDS = [
  "/note-research", "/note-title", "/note-outline",
  "/note-draft", "/note-post-plan"
] as const;
type NoteCommand = typeof NOTE_COMMANDS[number];

function detectNoteCommand(message: string): NoteCommand | null {
  for (const cmd of NOTE_COMMANDS) {
    if (message.startsWith(cmd) || message.includes(cmd)) return cmd;
  }
  return null;
}

// 投資ログ自動保存（バックグラウンド）
async function autoSaveFundLog(ticker: string, action: string, notes: string) {
  try {
    await fetch("/api/fund/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, action, notes }),
    });
  } catch (e) {
    console.error("[DEBUG] Fund log auto-save failed:", e);
  }
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
  const body = (await req.json()) as {
    message?: string;
    provider?: "ollama" | "gemini" | "groq" | "auto";
    secretaryId?: string;
    action?: string;
    payload?: any;
  };
  const { message, provider, secretaryId, action, payload } = body;

  // Handle Inbox Approval Action
  if (action === "inbox-approve") {
    let bus = await loadBus();
    const updatedBus = await processInboxApproval(bus, payload as InboxApprovePayload);
    return NextResponse.json({
      success: true,
      currentBus: updatedBus
    });
  }

  // Handle Switch Company Action
  if (action === "switch-company") {
    let bus = await loadBus();
    bus.activeCompany = payload.company;
    const activeSec = getActiveBus(bus).activeSecretary;
    await saveBus(bus);
    return NextResponse.json({
      success: true,
      currentBus: bus,
      activeSecretary: activeSec
    });
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: "メッセージが空です" }, { status: 400 });
  }

  // 1. Load Context Bus
  let bus = await loadBus();

  // Intercept /morning-report command
  if (message.startsWith("/morning-report") || message.includes("/morning-report")) {
    try {
      const { generateMorningReport } = await import("@/app/lib/report/morning");
      const reportText = await generateMorningReport();
      return NextResponse.json({
        reply: reportText,
        currentBus: bus,
        flow: ["personal-morning"],
        secretaryId: "personal-morning"
      });
    } catch (e: any) {
      console.error("[Morning API Intercept] Error:", e);
      return NextResponse.json({ error: `モーニングレポートの生成に失敗しました: ${e.message}` }, { status: 500 });
    }
  }

  // Step 1: Capture Raw Input Event
  try {
    await saveCaptureEvent(message, "chat", bus.activeCompany);
  } catch (err) {
    console.error("[DEBUG] Failed to save capture event:", err);
  }

  // Handle Inbox Queue buffering for executive-inbox
  if (secretaryId === "executive-inbox") {
    bus = await addToInboxQueue(bus, message);

    const activeBus = getActiveBus(bus);
    const flow = [...activeBus.decisionHistory.map((d: DecisionNode) => d.to), "executive-inbox"];
    await saveFlowMapLog(flow);

    return NextResponse.json({
      reply: `インボックスにインプットを収集しました。画面上でタスクやアイデアとして整理してください。`,
      currentBus: bus,
      flow,
      secretaryId: "executive-inbox"
    });
  }

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
    if (targetSecId !== getActiveBus(bus).activeSecretary) {
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

  const activeBus = getActiveBus(bus);
  const busContext = `
---
## 会話共有コンテキスト（Context Bus - ${bus.activeCompany}）
現在の意図 (Intent): ${activeBus.currentIntent || "未設定"}
現在の目標 (Goal): ${activeBus.currentGoal || "未設定"}
担当部署: ${activeBus.activeDepartment}
現在のアクティブ秘書: ${registryEntry.config.name} (${targetSecId})
直前の秘書: ${activeBus.previousSecretary || "なし"}

### 決定履歴 (Decision History):
${activeBus.decisionHistory.slice(-5).map((h: DecisionNode) => `- [${h.timestamp}] ${h.from} → ${h.to} (理由: ${h.reason})`).join("\n")}

### タスクパイプライン (Task Pipeline):
${activeBus.taskPipeline.map((t: TaskNode) => `- [${t.status}] ${t.title} (担当: ${t.owner}) (ID: ${t.id})`).join("\n")}
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

  // Fund Manager 専用インジェクション
  if (targetSecId === "personal-fund") {
    const detectedCmd = detectFundCommand(message);
    let fundInstruction = "";
    if (detectedCmd === "/fund-heatmap") {
      fundInstruction = `
---
## Fund Manager 追加指示 (/fund-heatmap用)
- 必ず【保有割合】【集中リスク】【テーマ偏り】【利益偏り】【次の再配分候補】の5項目フォーマットで回答してください。
- positions.md、themes.md 等の保有株リストをベースに、ポートフォリオの集中度やリスクを徹底分析してください。
- 感情的表現は禁止です。価格や％等の数値を具体的に含めてください。
---
`;
    } else {
      fundInstruction = `
---
## Fund Manager 追加指示
- 必ず【市場環境】【テーマ資金流入】【保有株評価】【買い候補】【押し目ライン】【利確ライン】【損切りライン】【最大リスク】【Decision Score】の9項目フォーマットで回答してください。
- 【Decision Score】は以下の形式で各10点評価を含めてください：
  Growth: X/10
  Margin: X/10
  Momentum: X/10
  Valuation: X/10
  Theme Strength: X/10
  Risk: X/10
- 価格・パーセント等の数値を具体的に含めてください。感情的表現は禁止です。
- 買い・売りシグナルを提示した場合は回答の末尾に以下のコメントを必ず追加してください：
<!-- FUND_LOG: { "ticker": "銘柄ティッカー", "action": "buy|sell|hold|review", "price": 数値または0, "notes": "判断根拠の要約" } -->
${detectedCmd ? `- 検出コマンド: ${detectedCmd}` : ""}
---
`;
    }
    systemPrompt += fundInstruction;
  }

  // Note Secretary 専用インジェクション
  if (targetSecId === "personal-note") {
    const detectedNoteCmd = detectNoteCommand(message);
    if (detectedNoteCmd) {
      const noteInstruction = `
---
## Note Department 追加指示
- 検出コマンド: ${detectedNoteCmd}
- コマンド別処理方針：
  - /note-research: テーマに沿った読者のニーズ、ペルソナ、市場競合分析を行ってください。themes.md や monetization.md の情報を活用してください。
  - /note-title: 読者のアテンションを惹きつけるタイトル案を5つ提示してください（フックワード、対比、数字を含める）。hooks.md のテンプレートを参考にしてください。
  - /note-outline: 記事の構成案（導入・本論1・本論2・まとめ・CTA）を提示してください。
  - /note-draft: 構成案をベースに、導入から本文（1500〜2000字程度想定）を詳細に執筆してください。hooks.md の導入文やCTAテンプレートを活用してください。
  - /note-post-plan: 投稿スケジュール、X(旧Twitter)での告知文章のセット、CV導線の確認計画を提示してください。
---
`;
      systemPrompt += noteInstruction;
    }
  }

  // Morning Secretary 専用インジェクション
  if (targetSecId === "personal-morning") {
    systemPrompt += `
---
## 朝会秘書（Morning Secretary）追加指示
- モーニングレポート作成依頼（/morning-report）以外の通常の対話においても、常に今日のアクションや日次オペレーション管理の観点から簡潔にアドバイスを提示してください。
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
        const activeBus = getActiveBus(bus);
        if (updates.currentIntent) activeBus.currentIntent = updates.currentIntent;
        if (updates.currentGoal) activeBus.currentGoal = updates.currentGoal;
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

    // Fund ログ自動解析・保存
    if (targetSecId === "personal-fund") {
      const fundLogMatch = rawReply.match(/<!-- FUND_LOG: (\{[\s\S]*?\}) -->/);
      if (fundLogMatch) {
        try {
          const fundLog = JSON.parse(fundLogMatch[1]) as {
            ticker: string;
            action: string;
            price?: number;
            notes?: string;
          };
          if (fundLog.ticker && fundLog.action) {
            // ローカル vault に直接保存（サーバーサイド）
            const { saveVaultFile: saveFund } = await import("@/app/lib/vault");
            const now = new Date();
            const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
            const dateStr = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth()+1).padStart(2,"0")}-${String(jst.getUTCDate()).padStart(2,"0")}`;
            const ticker = fundLog.ticker.toUpperCase();
            const logPath = `memory/personal/fund/investment-log/${dateStr}-${ticker}.md`;
            const logContent = `---\nid: fund-log-${dateStr}-${ticker.toLowerCase()}\ntype: investment_log\nticker: ${ticker}\naction: ${fundLog.action}\ndate: ${dateStr}\n---\n\n# 投資判断ログ — ${ticker} ${fundLog.action} ${dateStr}\n\n## AI判断メモ\n\n${fundLog.notes ?? message}\n\n## 入力メッセージ\n\n${message}\n`;
            saveFund(logPath, logContent).catch((e: Error) =>
              console.error("[DEBUG] Fund log save failed:", e)
            );
          }
        } catch (e) {
          console.error("[DEBUG] Fund log parse error:", e);
        }
      }
      // Fund ログタグを本文から除去
      cleanReply = cleanReply.replace(/<!-- FUND_LOG: [\s\S]*? -->/g, "").trim();
    }

    // 8. Background logging
    saveChatLog(targetSecId, message, cleanReply).catch((err) => {
      console.error("[DEBUG] Background saveChatLog failed:", err);
    });

    // Save FlowMap Log
    const flow = [...getActiveBus(bus).decisionHistory.map((d: DecisionNode) => d.to), targetSecId];
    await saveFlowMapLog(flow);

    // Save Context Bus back to file
    await saveBus(bus);

    return NextResponse.json({
      reply: cleanReply,
      suggestSave: parsedSuggestion.suggestSave,
      routeTo,
      confidence,
      flow,
      activeAuthority: "",
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