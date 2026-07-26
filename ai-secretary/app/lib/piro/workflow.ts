import { callAI } from "@/app/lib/ai/client";
import { listVaultDirectory, saveVaultFile } from "@/app/lib/vault";
import { toSlug } from "@/app/lib/utils/slug";
import { PIRO_CONTENT_PROMPT, PIRO_RESEARCH_PROMPT, PIRO_X_PROMPT } from "./prompts";
import { PiroArtifact, PiroRunInput, PiroRunResult } from "./types";

const PIRO_ROOT = "memory/personal/piro";

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function frontmatter(kind: PiroArtifact["kind"], topic: string, body: string): string {
  const date = todayJst();
  return `---
type: piro_${kind}
topic: ${JSON.stringify(topic)}
status: draft
created: ${date}
updated: ${date}
human_review: required
---

${body.trim()}
`;
}

async function uniquePath(dir: string, topic: string): Promise<string> {
  const date = todayJst();
  const slug = toSlug(topic) || "untitled";
  const files = await listVaultDirectory(dir);
  let name = `${date}-${slug}.md`;
  let suffix = 2;
  while (files.includes(name)) {
    name = `${date}-${slug}-${suffix}.md`;
    suffix += 1;
  }
  return `${dir}/${name}`;
}

async function generateAndSave(
  kind: PiroArtifact["kind"],
  topic: string,
  message: string,
  systemPrompt: string
): Promise<PiroArtifact> {
  const generated = await callAI(message, systemPrompt, { provider: "auto" });
  const markdown = frontmatter(kind, topic, generated);
  const dirs: Record<PiroArtifact["kind"], string> = {
    research: `${PIRO_ROOT}/02_Research`,
    content: `${PIRO_ROOT}/03_Content/Drafts`,
    x: `${PIRO_ROOT}/04_Distribution/X`,
  };
  const path = await uniquePath(dirs[kind], topic);
  await saveVaultFile(path, markdown);
  return { kind, path, markdown };
}

export async function runPiroWorkflow(input: PiroRunInput): Promise<PiroRunResult> {
  const topic = input.topic.trim();
  const audience = input.audience?.trim() || "AIを活用して成長・副業・市場価値向上を目指す20〜35歳";
  const context = input.context?.trim() || "追加情報なし";
  const artifacts: PiroArtifact[] = [];
  let research = context;
  let content = context;

  if (input.workflow === "research" || input.workflow === "full") {
    const artifact = await generateAndSave(
      "research",
      topic,
      `テーマ: ${topic}\n想定読者: ${audience}\n前提・実体験: ${context}\n\n事実・分析・仮説を分けて調査してください。`,
      PIRO_RESEARCH_PROMPT
    );
    artifacts.push(artifact);
    research = artifact.markdown;
  }

  if (input.workflow === "content" || input.workflow === "full") {
    const artifact = await generateAndSave(
      "content",
      topic,
      `テーマ: ${topic}\n想定読者: ${audience}\n調査・背景材料:\n${research}\n\n読者が実行できる記事下書きを作成してください。`,
      PIRO_CONTENT_PROMPT
    );
    artifacts.push(artifact);
    content = artifact.markdown;
  }

  if (input.workflow === "x" || input.workflow === "full") {
    const artifact = await generateAndSave(
      "x",
      topic,
      `テーマ: ${topic}\n想定読者: ${audience}\n記事・知識材料:\n${content}\n\nX投稿案とスレッド案を作成してください。`,
      PIRO_X_PROMPT
    );
    artifacts.push(artifact);
  }

  return { workflow: input.workflow, topic, artifacts };
}

export async function getPiroStatus() {
  const paths = {
    research: `${PIRO_ROOT}/02_Research`,
    content: `${PIRO_ROOT}/03_Content/Drafts`,
    x: `${PIRO_ROOT}/04_Distribution/X`,
  };
  const [research, content, x] = await Promise.all([
    listVaultDirectory(paths.research),
    listVaultDirectory(paths.content),
    listVaultDirectory(paths.x),
  ]);
  const sortedDesc = (names: string[]) => [...names].sort().reverse();
  const today = todayJst();

  return {
    counts: { research: research.length, content: content.length, x: x.length },
    /** 今日作成された記事下書きの数（Note事業部ダッシュボード用） */
    todayContent: content.filter((name) => name.startsWith(today)).length,
    recent: {
      research: sortedDesc(research).slice(0, 3),
      content: sortedDesc(content).slice(0, 3),
      x: sortedDesc(x).slice(0, 3),
    },
    /** Drafts管理・Knowledge Baseタブ用の全件リスト（新しい順） */
    files: {
      research: sortedDesc(research),
      content: sortedDesc(content),
      x: sortedDesc(x),
    },
    dirs: paths,
  };
}
