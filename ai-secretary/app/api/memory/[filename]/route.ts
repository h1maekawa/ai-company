import { NextRequest, NextResponse } from "next/server";
import { getFileContent, updateFileContent } from "@/app/lib/github";
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";

const ALLOWED_FILENAMES = ["role.md", "tasks.md", "profile.md", "goals.md", "today.md"];

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

function getInitialTemplate(filename: string): string {
  if (filename === "role.md") return ROLE_DEFAULT_TEMPLATE;
  if (filename === "tasks.md") return TASKS_DEFAULT_TEMPLATE;
  return "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const authError = verifyApiSecret(request);
  if (authError) return authError;

  const { filename } = params;

  if (!ALLOWED_FILENAMES.includes(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const gitPath = `memory/${filename}`;
    let { content, sha } = await getFileContent(gitPath);

    // role.md または tasks.md が存在しない場合は初期テンプレートを返す
    if (!sha && (filename === "role.md" || filename === "tasks.md")) {
      content = getInitialTemplate(filename);
    }

    return NextResponse.json({ content, sha });
  } catch (error: any) {
    console.error("GET memory error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch file content" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const authError = verifyApiSecret(request);
  if (authError) return authError;

  const { filename } = params;

  if (!ALLOWED_FILENAMES.includes(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const content = body?.content;

    if (typeof content !== "string") {
      return NextResponse.json({ error: "Content must be a string" }, { status: 400 });
    }

    const gitPath = `memory/${filename}`;

    // 現在のshaを取得してからupdateFileContentでコミット
    const { sha } = await getFileContent(gitPath);

    const commitMessage = `Update ${filename} via web UI`;
    await updateFileContent(gitPath, content, commitMessage, sha);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT memory error:", error);
    return NextResponse.json({ error: error.message || "Failed to update file content" }, { status: 500 });
  }
}
