import { NextRequest, NextResponse } from "next/server";
import { loadBus, saveBus } from "@/app/lib/context/bus-server";
import { switchSecretary } from "@/app/lib/context/bus";
import { routeRequest } from "@/app/lib/router/executive";
import { findSecretary } from "@/app/lib/config/registry";
import { loadScopedMemory } from "@/app/lib/memory/loader";
import { saveChatLog } from "@/app/lib/memory/logs";
import { getVaultFile } from "@/app/lib/vault";
import { getFileContent } from "@/app/lib/github";
import { callGemini } from "@/app/lib/ai/gemini";
import { callOllama } from "@/app/lib/ai/ollama";
import { SecretaryMode } from "@/app/lib/prompts";

const ROLE_DEFAULT_TEMPLATE = `# 現在の役割

## Crestix
- 共同創業者として経営全般に関与

## 個人
- AI Company構築によるタスク・情報管理の効率化
- note収益化（高単価アフィリエイト軸）

最終更新: (自動更新)
`;

const TASKS_DEFAULT_TEMPLATE = `# やるべきこと

## 今日
- (AIとの会話で更新)

## 今週
- (AIとの会話で更新)

## 進行中プロジェクト
- AI Company開発
- note収益化

最終更新: (自動更新)
`;

function resolveCompanyContext(mode: string | undefined | null) {
  const isCompanyMode = mode === "business" || mode === "company";
  return {
    busCompany: (isCompanyMode ? "crestix" : "personal") as "crestix" | "personal",
    activeCompany: (isCompanyMode ? "company" : "personal") as "personal" | "company",
  } as const;
}

function shouldUseGemini(message: string): boolean {
  const geminiKeywords = [
    "最新", "ニュース", "今日の", "現在", "リアルタイム",
    "調査", "検索", "トレンド", "流行", "今週", "最近",
  ];
  return geminiKeywords.some((kw) => message.includes(kw));
}

export async function POST(req: NextRequest) {
  try {
    const { message, provider, mode } = (await req.json()) as {
      message?: string;
      provider?: "ollama" | "gemini" | "auto";
      mode?: SecretaryMode;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "メッセージが空です" }, { status: 400 });
    }

    // 1. Resolve company contexts from mode
    const { busCompany, activeCompany } = resolveCompanyContext(mode);

    // 2. Perform intent routing
    const routeResult = await routeRequest(message, activeCompany);
    const targetSecretaryId = routeResult.secretary;

    // 3. Find secretary config
    const secretaryEntry = findSecretary(targetSecretaryId);
    if (!secretaryEntry) {
      return NextResponse.json(
        { error: `秘書ID ${targetSecretaryId} が見つかりません` },
        { status: 404 }
      );
    }

    // 4. Load memory context from scope (filtered by activeCompany)
    const { files } = await loadScopedMemory(targetSecretaryId, activeCompany);
    let systemPrompt = `${secretaryEntry.config.prompt}`;

    if (files.length > 0) {
      const memoryBlock = files
        .map((f) => `### ${f.path}\n${f.content}`)
        .join("\n\n");
      systemPrompt += `\n\n## Scoped Memory Context\n${memoryBlock}`;
    }

    // 5. Context injection from recent chat summary log
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateHyphen = `${year}-${month}-${day}`;
    const chatLogPath = `memory/chat-log/${targetSecretaryId}/${dateHyphen}-summary.md`;

    try {
      const chatLogFile = await getVaultFile(chatLogPath);
      if (chatLogFile.content) {
        systemPrompt += `\n\n## 直近の会話コンテキスト（今日の要約）\n${chatLogFile.content.trim()}`;
      }
    } catch (e) {
      // Quiet fail if log summary doesn't exist yet for today
    }

    // 6. Role / Tasks update prompt append for company context
    if (activeCompany === "company") {
      try {
        const roleRes = await getFileContent("ai-company/memory/role.md");
        const tasksRes = await getFileContent("ai-company/memory/tasks.md");

        const roleContent = roleRes.sha ? roleRes.content : ROLE_DEFAULT_TEMPLATE;
        const tasksContent = tasksRes.sha ? tasksRes.content : TASKS_DEFAULT_TEMPLATE;

        systemPrompt += `\n\n---\n## 現在の役割（role.md）\n${roleContent}\n\n## やるべきこと（tasks.md）\n${tasksContent}\n---\n\n会話の中で前川の役割やタスクに変化・更新があった場合は、\n返答の最後に以下の形式で更新提案を含めてください（変化がない場合は不要）:\n\n[TASKS_UPDATE]\n（更新後のtasks.md全文をここに）\n[/TASKS_UPDATE]`;
      } catch (e) {
        console.error("Failed to append GitHub memory to system prompt:", e);
      }
    }

    // 7. Determine provider and call LLM
    // Vercel serverless 環境では Ollama（localhost）に接続できないため、強制的に Gemini を使用する。
    // クライアント側の provider 指定はローカル開発時のみ有効。
    const isServerless = !!process.env.VERCEL;
    let useGemini = false;
    if (isServerless) {
      useGemini = true; // Vercel 上は常に Gemini
    } else if (provider === "gemini") {
      useGemini = true;
    } else if (provider === "auto") {
      useGemini = shouldUseGemini(message);
    }

    const reply = useGemini
      ? await callGemini(message, systemPrompt)
      : await callOllama(message, systemPrompt);
    const usedProvider = useGemini ? "gemini" : "ollama";

    // 8. Update Bus after successful response generation
    try {
      let bus = await loadBus();
      bus.activeCompany = busCompany;
      bus = switchSecretary(bus, targetSecretaryId, `User request: ${message.substring(0, 30)}...`);
      await saveBus(bus);
    } catch (busErr) {
      console.error("Failed to update ContextBus (non-fatal):", busErr);
    }

    // 9. Save chat summary log (failsafe)
    try {
      await saveChatLog(targetSecretaryId, message, reply);
    } catch (logErr) {
      console.error("Failed to save chat summary log (non-fatal):", logErr);
    }

    return NextResponse.json({
      reply,
      provider: usedProvider,
      mode: mode ?? "note",
      secretary: targetSecretaryId,
    });
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : "不明なエラー";
    console.error("Chat API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
