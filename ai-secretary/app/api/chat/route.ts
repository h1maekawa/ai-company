import { NextRequest, NextResponse } from "next/server";
import { getSystemPrompt, SecretaryMode } from "@/app/lib/prompts";
import { getFileContent } from "@/app/lib/github";

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

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:8b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = "gemini-2.0-flash";

// ─── Ollama ───────────────────────────────────────────
async function callOllama(message: string, systemPrompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data?.message?.content ?? "応答を取得できませんでした。";
}

// ─── Gemini ───────────────────────────────────────────
async function callGemini(message: string, systemPrompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEYが設定されていません。.env.localを確認してください。");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message ?? `Gemini error: ${res.status}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "応答を取得できませんでした。";
}

// ─── ルーティング判定 ──────────────────────────────────
function shouldUseGemini(message: string): boolean {
  const geminiKeywords = [
    "最新", "ニュース", "今日の", "現在", "リアルタイム",
    "調査", "検索", "トレンド", "流行", "今週", "最近",
  ];
  return geminiKeywords.some((kw) => message.includes(kw));
}

// ─── メインハンドラー ──────────────────────────────────
export async function POST(req: NextRequest) {
  const { message, provider, mode } = (await req.json()) as {
    message?: string;
    provider?: "ollama" | "gemini" | "auto";
    mode?: SecretaryMode;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "メッセージが空です" }, { status: 400 });
  }

  // 秘書モード別のシステムプロンプトを取得
  let systemPrompt = getSystemPrompt(mode);

  if (mode === "business") {
    try {
      const roleRes = await getFileContent("ai-company/memory/role.md");
      const tasksRes = await getFileContent("ai-company/memory/tasks.md");

      const roleContent = roleRes.sha ? roleRes.content : ROLE_DEFAULT_TEMPLATE;
      const tasksContent = tasksRes.sha ? tasksRes.content : TASKS_DEFAULT_TEMPLATE;

      systemPrompt += `\n\n---\n## 現在の役割（role.md）\n${roleContent}\n\n## やるべきこと（tasks.md）\n${tasksContent}\n---\n\n会話の中で前川の役割やタスクに変化・更新があった場合は、\n返答の最後に以下の形式で更新提案を含めてください（変化がない場合は不要）:\n\n[TASKS_UPDATE]\n（更新後のtasks.md全文をここに）\n[/TASKS_UPDATE]`;
    } catch (e) {
      console.error("Failed to append GitHub memory to system prompt:", e);
      // GitHub API呼び出しが失敗してもエラーにせず、追記なしで通常通り進める(フォールバック)
    }
  }

  // provider: "ollama" | "gemini" | "auto"
  let useGemini = false;
  if (provider === "gemini") useGemini = true;
  else if (provider === "auto") useGemini = shouldUseGemini(message);

  try {
    const reply = useGemini
      ? await callGemini(message, systemPrompt)
      : await callOllama(message, systemPrompt);
    const usedProvider = useGemini ? "gemini" : "ollama";
    return NextResponse.json({ reply, provider: usedProvider, mode: mode ?? "note" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error(msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
