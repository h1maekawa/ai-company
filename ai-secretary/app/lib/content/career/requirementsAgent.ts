import fs from "node:fs";
import path from "node:path";
import { callOllamaForCareer } from "./ollamaGenerator";
import { careerHash, careerId } from "./ids";

const REQ_DIR = path.resolve(process.cwd(), "memory/personal/career/requirements");

export type CareerRequirementDoc = {
  id: string;
  title: string;
  rawRequest: string;
  markdownContent: string;
  status: "draft" | "approved" | "rejected";
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const SYSTEM_PROMPT = `あなたはAI Company OSの主任システムアナリスト・要件定義AIです。
ユーザーから提供された事業要望・機能アイデアから、厳密なソフトウェア要件定義書をMarkdownで生成してください。

以下の形式に従って日本語で構造化してください：
# 要件定義書: [タイトル]

## 1. 背景と目的
- 目的と事業価値
- 想定ユーザーと提供価値
- ブランド方針・保護境界（匿名性・個人情報保護）

## 2. 必須機能要件 (REQ-XXX)
- REQ-001: ...
- REQ-002: ...

## 3. 受入基準 (AC-XXX)
- AC-001: ...
- AC-002: ...

## 4. 自動テスト項目
- 単体テスト項目
- 結合・安全ガードレールテスト項目

## 5. 人間承認ゲート・残るリスク
- 人間の承認が必要な操作
- 外部連携・セキュリティ上の注意点
`;

export async function generateCareerRequirements(
  userRequest: string,
  title = "就活SNS新機能要件",
  now = new Date()
): Promise<CareerRequirementDoc> {
  const reqText = userRequest.trim();
  if (reqText.length < 10) {
    throw new Error("REQUEST_TEXT_TOO_SHORT: 10文字以上の要望を入力してください");
  }

  const prompt = `要望内容：\n${reqText}\n\n上記に基づき、就活SNS（就活攻略ラボ）の機能要件定義書を作成してください。ローカルAI・完全匿名・安全ガードレールを最優先にしてください。`;
  const markdown = await callOllamaForCareer(prompt, SYSTEM_PROMPT);

  const at = now.toISOString();
  const id = careerId("req");
  const doc: CareerRequirementDoc = {
    id,
    title,
    rawRequest: reqText,
    markdownContent: markdown,
    status: "draft",
    approvedAt: null,
    approvedBy: null,
    createdAt: at,
    updatedAt: at,
  };

  saveRequirementDoc(doc);
  return doc;
}

export function saveRequirementDoc(doc: CareerRequirementDoc): void {
  fs.mkdirSync(REQ_DIR, { recursive: true });
  const filePath = path.join(REQ_DIR, `${doc.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), "utf-8");
}

export function loadRequirementDocs(): CareerRequirementDoc[] {
  if (!fs.existsSync(REQ_DIR)) return [];
  const files = fs.readdirSync(REQ_DIR).filter((f) => f.endsWith(".json"));
  return files.map((file) => {
    try {
      const content = fs.readFileSync(path.join(REQ_DIR, file), "utf-8");
      return JSON.parse(content) as CareerRequirementDoc;
    } catch {
      return null;
    }
  }).filter((doc): doc is CareerRequirementDoc => Boolean(doc));
}

export function approveRequirementDoc(id: string, approver: string, now = new Date()): CareerRequirementDoc {
  const docs = loadRequirementDocs();
  const doc = docs.find((d) => d.id === id);
  if (!doc) {
    throw new Error("REQUIREMENT_DOC_NOT_FOUND");
  }
  doc.status = "approved";
  doc.approvedAt = now.toISOString();
  doc.approvedBy = approver;
  doc.updatedAt = doc.approvedAt;
  saveRequirementDoc(doc);
  return doc;
}
