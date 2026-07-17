import { NextRequest, NextResponse } from "next/server";
import { loadBus, saveBus } from "@/app/lib/context/bus-server";
import { switchSecretary } from "@/app/lib/context/bus";
import { routeRequest } from "@/app/lib/router/executive";
import { findSecretary } from "@/app/lib/config/registry";
import { loadScopedMemory } from "@/app/lib/memory/loader";
import { saveChatLog } from "@/app/lib/memory/logs";
import { getVaultFile } from "@/app/lib/vault";
import { getFileContent } from "@/app/lib/github";
import { callAI } from "@/app/lib/ai/client";
import { AIProvider } from "@/app/lib/ai/client";
import { SecretaryMode } from "@/app/lib/prompts";
import { ChatMessage } from "@/app/lib/ai/types";

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

function resolveProvider(provider: unknown): AIProvider {
  const requested = typeof provider === "string" ? provider : undefined;
  const fallback = process.env.DEFAULT_PROVIDER || "gemini";
  const resolved = requested || fallback;
  if (resolved === "gemini" || resolved === "groq" || resolved === "ollama" || resolved === "auto") {
    return resolved;
  }
  return "gemini";
}

function resolveCompanyContext(mode: string | undefined | null) {
  const isCompanyMode = mode === "business" || mode === "company";
  return {
    activeCompany: (isCompanyMode ? "company" : "personal") as "personal" | "company",
  } as const;
}

export async function POST(req: NextRequest) {
  try {
    const { message, provider, mode, history, secretaryId } = (await req.json()) as {
      message?: string;
      provider?: AIProvider;
      mode?: SecretaryMode;
      history?: ChatMessage[];
      secretaryId?: string;
    };

    const chatHistory: ChatMessage[] = Array.isArray(history) ? history.slice(-10) : [];

    if (!message?.trim()) {
      return NextResponse.json({ error: "メッセージが空です" }, { status: 400 });
    }

    // 1. Resolve company contexts from mode
    const { activeCompany } = resolveCompanyContext(mode);

    // 2. Resolve target secretary: an explicit secretaryId (hub node) pins the
    //    department; otherwise fall back to keyword intent routing
    const requestedProvider = resolveProvider(provider);
    let targetSecretaryId: string;
    if (secretaryId && findSecretary(secretaryId)) {
      targetSecretaryId = secretaryId;
    } else {
      const routeResult = await routeRequest(message, activeCompany, requestedProvider);
      targetSecretaryId = routeResult.secretary;
    }

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
        const roleRes = await getFileContent("memory/role.md");
        const tasksRes = await getFileContent("memory/tasks.md");

        const roleContent = roleRes.sha ? roleRes.content : ROLE_DEFAULT_TEMPLATE;
        const tasksContent = tasksRes.sha ? tasksRes.content : TASKS_DEFAULT_TEMPLATE;

        systemPrompt += `\n\n---\n## 現在の役割（role.md）\n${roleContent}\n\n## やるべきこと（tasks.md）\n${tasksContent}\n---\n\n会話の中で前川の役割やタスクに変化・更新があった場合は、\n返答の最後に以下の形式で更新提案を含めてください（変化がない場合は不要）:\n\n[TASKS_UPDATE]\n（更新後のtasks.md全文をここに）\n[/TASKS_UPDATE]`;
      } catch (e) {
        console.error("Failed to append GitHub memory to system prompt:", e);
      }
    }

    // 7. Call LLM
    const reply = await callAI(message, systemPrompt, {
      history: chatHistory,
      provider: requestedProvider,
    });
    const usedProvider =
      requestedProvider !== "auto"
        ? requestedProvider
        : process.env.GEMINI_API_KEY
          ? "gemini"
          : (process.env.GROQ_API_KEY ? "groq" : "ollama");

    // 8. Update Bus after successful response generation
    try {
      let bus = await loadBus();
      bus.activeCompany = activeCompany;
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
