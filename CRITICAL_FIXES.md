# クリティカル修正 要件定義書
> Claude Code 向け実装指示書  
> 対象プロジェクト: `ai-company/ai-secretary`  
> 修正件数: 3件（全APIに認証追加 / XSS対策 / マルチターン対話の実現）

---

## TASK-01 全APIに認証を追加（シークレットヘッダー検証）

### 背景・問題
`/api/chat`・`/api/vault`・`/api/memory`・`/api/fund`・`/api/note`・`/api/knowledge`・`/api/report` の全エンドポイントが認証なしで公開されている。誰でも GitHub 上のメモリファイルを読み書きできる状態。

### 方針
共通ミドルウェア関数 `verifyApiSecret()` を作り、全 route handler の先頭で呼ぶ。シークレットは環境変数 `API_SECRET` で管理する。

---

### Step 1: 共通認証関数を作成

**対象ファイル（新規作成）:**  
`ai-secretary/app/lib/auth/verifyApiSecret.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export function verifyApiSecret(
  req: NextRequest
): NextResponse | null {
  const secret = process.env.API_SECRET;

  // API_SECRET が未設定の場合は開発環境として通す（ローカルのみ）
  if (!secret) {
    if (process.env.VERCEL) {
      return NextResponse.json(
        { error: "サーバー設定エラー: API_SECRET が未設定です" },
        { status: 500 }
      );
    }
    return null; // 開発環境はスルー
  }

  const authHeader = req.headers.get("x-api-secret");
  if (authHeader !== secret) {
    return NextResponse.json(
      { error: "認証エラー: アクセスが拒否されました" },
      { status: 401 }
    );
  }

  return null; // 認証OK
}
```

---

### Step 2: 全 route handler に認証を追加

以下の **すべてのファイル** の各エクスポート関数（GET / POST / PUT）の先頭に認証チェックを追加する。

**str_replace パターン（共通）:**

#### `app/api/chat/route.ts`

```
// Before
export async function POST(req: NextRequest) {
  try {
    const { message, provider, mode } = (await req.json()) as {

// After
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";

export async function POST(req: NextRequest) {
  const authError = verifyApiSecret(req);
  if (authError) return authError;

  try {
    const { message, provider, mode } = (await req.json()) as {
```

#### `app/api/vault/[...path]/route.ts`

```
// Before (GET)
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  try {

// After
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  const authError = verifyApiSecret(request);
  if (authError) return authError;

  try {
```

```
// Before (PUT)
export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  try {

// After
export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  const authError = verifyApiSecret(request);
  if (authError) return authError;

  try {
```

#### `app/api/memory/[filename]/route.ts`

```
// Before (GET)
export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;

// After
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const authError = verifyApiSecret(request);
  if (authError) return authError;

  const { filename } = params;
```

```
// Before (PUT)
export async function PUT(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;

// After
export async function PUT(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const authError = verifyApiSecret(request);
  if (authError) return authError;

  const { filename } = params;
```

#### `app/api/fund/log/route.ts`

```
// Before (POST)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {

// After
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authError = verifyApiSecret(request);
  if (authError) return authError;

  try {
```

```
// Before (GET)
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {

// After
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = verifyApiSecret(request);
  if (authError) return authError;

  try {
```

#### `app/api/note/promote/route.ts` および `app/api/note/generate/route.ts` および `app/api/knowledge/save/route.ts` および `app/api/report/morning/route.ts`

同様に各エクスポート関数の先頭に以下を追加する（importも追加）:

```typescript
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";

// 各 export async function の先頭:
const authError = verifyApiSecret(req); // または request
if (authError) return authError;
```

---

### Step 3: フロントエンドから API を呼ぶ箇所にヘッダーを追加

**対象ファイル:** `app/page.tsx`

フロント側の fetch 呼び出し全箇所にヘッダーを付与する。

```
// Before（handleSubmit の fetch）
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, provider, mode }),
      });

// After
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": process.env.NEXT_PUBLIC_API_SECRET ?? "",
        },
        body: JSON.stringify({ message: text, provider, mode }),
      });
```

同様に `handleSaveRole`・`handleSaveTasks`・memory fetch の全 fetch 呼び出しにも `"x-api-secret": process.env.NEXT_PUBLIC_API_SECRET ?? ""` を headers に追加する。

---

### Step 4: 環境変数を追加

**`.env.local`（ローカル開発用・新規追加）:**

```
API_SECRET=your-secret-key-here
NEXT_PUBLIC_API_SECRET=your-secret-key-here
```

**Vercel ダッシュボード:** `API_SECRET` と `NEXT_PUBLIC_API_SECRET` を同じ値で追加する。

> ⚠️ `NEXT_PUBLIC_` はブラウザに公開される。これは意図的（自分専用アプリのため）。外部公開する場合は Cookie/Session 認証へ移行する。

---

### 完了確認

- [ ] `verifyApiSecret.ts` が作成されている
- [ ] 全 route handler に認証チェックが追加されている
- [ ] `page.tsx` の全 fetch に `x-api-secret` ヘッダーが付いている
- [ ] `.env.local` に `API_SECRET` が設定されている
- [ ] `npm run build` がエラーなく通る
- [ ] curl で `401` が返ることを確認: `curl -X POST https://ai-company-ilqd.vercel.app/api/chat -H "Content-Type: application/json" -d '{"message":"test"}'`

---

## TASK-02 dangerouslySetInnerHTML を marked + DOMPurify に置き換え（XSS対策）

### 背景・問題
`app/page.tsx` の `renderMarkdown()` は手製の正規表現パーサーで、LLMレスポンスを `dangerouslySetInnerHTML` に直接渡している。AIが `<script>alert(1)</script>` を出力した場合そのまま実行される。

### 方針
`marked`（Markdownパーサー）+ `dompurify`（HTMLサニタイザー）を導入し、`renderMarkdown()` を置き換える。

---

### Step 1: パッケージをインストール

```bash
cd ai-secretary
npm install marked dompurify
npm install -D @types/dompurify
```

---

### Step 2: renderMarkdown を置き換え

**対象ファイル:** `app/page.tsx`

```
// Before（ファイル先頭付近）
function renderMarkdown(text: string): string {
  return text
    .replace(/^## (.+)$/gm, '<h2 class=\"text-lg font-bold text-blue-400 mt-5 mb-2\">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class=\"text-base font-semibold text-slate-300 mt-3 mb-1\">$1</h3>')
    .replace(/^\\d+\\. (.+)$/gm, '<li class=\"ml-4 list-decimal text-slate-300\">$1</li>')
    .replace(/^[-•] (.+)$/gm, '<li class=\"ml-4 list-disc text-slate-300\">$1</li>')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong class=\"text-white\">$1</strong>')
    .replace(/\\n{2,}/g, '</p><p class=\"mt-2\">')
    .replace(/\\n/g, "<br/>");
}

// After
import { marked } from "marked";
import DOMPurify from "dompurify";

// marked の設定（見出しにTailwindクラスを付与）
const renderer = new marked.Renderer();
renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
  const classes: Record<number, string> = {
    2: "text-lg font-bold text-blue-400 mt-5 mb-2",
    3: "text-base font-semibold text-slate-300 mt-3 mb-1",
  };
  const cls = classes[depth] ?? "font-semibold mt-2 mb-1";
  return `<h${depth} class="${cls}">${text}</h${depth}>`;
};
renderer.listitem = ({ text }: { text: string }) =>
  `<li class="ml-4 list-disc text-slate-300">${text}</li>`;
renderer.code = ({ text }: { text: string }) =>
  `<pre class="bg-slate-900 rounded p-2 text-xs overflow-x-auto my-2"><code>${text}</code></pre>`;

marked.setOptions({ renderer });

function renderMarkdown(text: string): string {
  const rawHtml = marked.parse(text) as string;
  // ブラウザ環境でのみ DOMPurify を実行（SSR対策）
  if (typeof window === "undefined") return rawHtml;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      "p","br","strong","em","ul","ol","li","h1","h2","h3","h4",
      "blockquote","code","pre","hr","a","table","thead","tbody","tr","th","td",
    ],
    ALLOWED_ATTR: ["href","class","target","rel"],
  });
}
```

---

### 完了確認

- [ ] `marked` と `dompurify` がインストールされている
- [ ] `renderMarkdown` が新しい実装に置き換わっている
- [ ] `<script>alert(1)</script>` をチャットで送ってもスクリプトが実行されないことを確認
- [ ] コードブロック・リスト・見出しが正しくレンダリングされることを確認
- [ ] `npm run build` がエラーなく通る

---

## TASK-03 チャット履歴を API に渡してマルチターン対話を実現

### 背景・問題
フロント側の `messages` ステートに履歴が溜まっているが、`/api/chat` には最新の1メッセージしか渡していない。LLMは毎回コンテキストなしで応答するため「さっき言った〇〇について」などの継続対話が成立しない。

### 方針
フロントから `messages`（会話履歴）を API に渡し、各LLMクライアントがマルチターン形式で呼べるよう `callGemini`・`callGroq`・`callOllama` のシグネチャを変更する。

---

### Step 1: 型定義を追加

**対象ファイル（新規作成）:**  
`ai-secretary/app/lib/ai/types.ts`

```typescript
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
```

---

### Step 2: callOllama をマルチターン対応に変更

**対象ファイル:** `app/lib/ai/ollama.ts`

```
// Before
export async function callOllama(message: string, systemPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        stream: false,
      }),
    });

// After
import { ChatMessage } from "./types";

export async function callOllama(
  message: string,
  systemPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
      }),
    });
```

---

### Step 3: callGroq をマルチターン対応に変更

**対象ファイル:** `app/lib/ai/groq.ts`

```
// Before
export async function callGroq(message: string, systemPrompt: string): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEYが設定されていません。.env.localを確認してください。");
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.7,
    }),
  });

// After
import { ChatMessage } from "./types";

export async function callGroq(
  message: string,
  systemPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEYが設定されていません。.env.localを確認してください。");
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
    }),
  });
```

---

### Step 4: callGemini をマルチターン対応に変更

**対象ファイル:** `app/lib/ai/gemini.ts`

```
// Before
export async function callGemini(message: string, systemPrompt: string): Promise<string> {
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

// After
import { ChatMessage } from "./types";

export async function callGemini(
  message: string,
  systemPrompt: string,
  history: ChatMessage[] = []
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEYが設定されていません。.env.localを確認してください。");
  }

  // Gemini は role が "model"（assistantではない）
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    }
  );
```

---

### Step 5: chat/route.ts で履歴を受け取り LLM に渡す

**対象ファイル:** `app/api/chat/route.ts`

```
// Before（リクエスト型定義部分）
    const { message, provider, mode } = (await req.json()) as {
      message?: string;
      provider?: "ollama" | "gemini" | "auto";
      mode?: SecretaryMode;
    };

// After
import { ChatMessage } from "@/app/lib/ai/types";

    const { message, provider, mode, history } = (await req.json()) as {
      message?: string;
      provider?: "ollama" | "gemini" | "auto";
      mode?: SecretaryMode;
      history?: ChatMessage[];
    };

    const chatHistory: ChatMessage[] = Array.isArray(history) ? history.slice(-10) : [];
    // 直近10件に絞ってコンテキスト長を管理
```

```
// Before（LLM呼び出し部分）
    let reply: string;
    if (effectiveProvider === "gemini") {
      reply = await callGemini(message, systemPrompt);
    } else if (effectiveProvider === "groq") {
      reply = await callGroq(message, systemPrompt);
    } else {
      reply = await callOllama(message, systemPrompt);
    }

// After
    let reply: string;
    if (effectiveProvider === "gemini") {
      reply = await callGemini(message, systemPrompt, chatHistory);
    } else if (effectiveProvider === "groq") {
      reply = await callGroq(message, systemPrompt, chatHistory);
    } else {
      reply = await callOllama(message, systemPrompt, chatHistory);
    }
```

---

### Step 6: フロントエンドから履歴を送信する

**対象ファイル:** `app/page.tsx`

```
// Before（handleSubmit の fetch body）
        body: JSON.stringify({ message: text, provider, mode }),

// After
        body: JSON.stringify({
          message: text,
          provider,
          mode,
          // assistantメッセージのprovider/modeはAPIには不要なので除外して送る
          history: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
```

---

### 完了確認

- [ ] `app/lib/ai/types.ts` が作成されている
- [ ] `callGemini` / `callGroq` / `callOllama` が `history` 引数を受け取るよう変更されている
- [ ] `chat/route.ts` が `history` を受け取り各LLMに渡している
- [ ] `page.tsx` の fetch body に `history` が含まれている
- [ ] 「さっき〇〇と言ったけど」など前の発言を参照する会話が成立することを確認
- [ ] `npm run build` がエラーなく通る

---

## 実装順序の推奨

```
TASK-01（認証）→ TASK-02（XSS）→ TASK-03（マルチターン）
```

TASK-01 を先に行い、その後 Vercel にデプロイして認証が機能することを確認してから残り2件を進める。TASK-02 と TASK-03 は独立しているため並行実装も可能。

---

## 変更ファイル一覧

| ファイル | 変更種別 | TASK |
|---|---|---|
| `app/lib/auth/verifyApiSecret.ts` | 新規作成 | 01 |
| `app/api/chat/route.ts` | 変更 | 01, 03 |
| `app/api/vault/[...path]/route.ts` | 変更 | 01 |
| `app/api/memory/[filename]/route.ts` | 変更 | 01 |
| `app/api/fund/log/route.ts` | 変更 | 01 |
| `app/api/note/promote/route.ts` | 変更 | 01 |
| `app/api/note/generate/route.ts` | 変更 | 01 |
| `app/api/knowledge/save/route.ts` | 変更 | 01 |
| `app/api/report/morning/route.ts` | 変更 | 01 |
| `app/page.tsx` | 変更 | 01, 02, 03 |
| `app/lib/ai/types.ts` | 新規作成 | 03 |
| `app/lib/ai/ollama.ts` | 変更 | 03 |
| `app/lib/ai/groq.ts` | 変更 | 03 |
| `app/lib/ai/gemini.ts` | 変更 | 03 |
| `.env.local` | 追記 | 01 |
