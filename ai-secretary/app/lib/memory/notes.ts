import { generateUniqueId } from "../utils/id";
import { saveVaultFile, listVaultDirectory, getVaultFile } from "../vault";
import { callGroq } from "../ai/groq";
import { callGemini } from "../ai/gemini";
import { callOllama } from "../ai/ollama";
import { toSlug } from "../utils/slug";
import { applyWikiLinks } from "../parser/wikilink";

export interface GenerateNoteInput {
  title: string;
  theme: string;
  target: string;
  purpose: string;
  cta: string;
  template?: string; // e.g. sales-template
  sourceRef?: string[];
}

async function callLLM(message: string, systemPrompt: string): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    return callGroq(message, systemPrompt);
  } else if (process.env.GEMINI_API_KEY) {
    return callGemini(message, systemPrompt);
  } else {
    return callOllama(message, systemPrompt);
  }
}

/**
 * Generates an article draft using LLM and templating, then saves it in memory/note/drafts/.
 */
export async function generateAndSaveNote(input: GenerateNoteInput): Promise<{ success: boolean; path: string; id: string }> {
  const { title, theme, target, purpose, cta, template = "", sourceRef = [] } = input;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateHyphen = `${year}-${month}-${day}`; // YYYY-MM-DD

  // 1. Load Template if provided
  let templateContent = "";
  if (template) {
    try {
      const templatePath = `memory/note/templates/${template}.md`;
      const file = await getVaultFile(templatePath);
      if (file.content) {
        templateContent = file.content;
      }
    } catch (e) {
      console.warn(`[DEBUG] Template not found: ${template}. Proceeding without template.`);
    }
  }

  // 2. Build AI Prompts
  const systemPrompt = `あなたは高品質なnote記事を執筆するプロフェッショナルな編集者です。
与えられたテーマ、ターゲット、目的、およびCTAに基づいて、読者の心を動かし行動を促す最高のnote記事を作成してください。

以下の記事構成の要件を守ってください：
1. タイトルは魅力的でクリック率（CTR）が高いものにしてください。
2. 導入文（リード文）では読者の悩みに共感し、この記事を読む価値を提示してください。
3. 本文は読みやすい見出し構成（H2, H3）にしてください。
4. まとめには、読者に対する明確な行動喚起（CTA）を含めてください。

${templateContent ? `\n必ず以下の【テンプレート構成】に沿って記事を執筆してください：\n${templateContent}\n` : ""}
`;

  const userMessage = `以下の指示に従って、note記事を執筆してください。

- **テーマ**: ${theme}
- **想定ターゲット**: ${target}
- **記事の目的**: ${purpose}
- **CTA（行動喚起）**: ${cta}

応答はマークダウン形式で記事本文のみを出力してください。タイトル、見出し、本文をすべて含めてください。余計な解説文や会話文（例：「はい、承知しました」など）は含めないでください。`;

  // 3. Generate article with LLM
  const generatedArticle = await callLLM(userMessage, systemPrompt);

  // Apply WikiLinks to body content
  const linkedArticle = applyWikiLinks(generatedArticle);

  // 4. Generate unique serial ID
  const id = await generateUniqueId("nt");

  // 5. Construct Frontmatter
  const frontmatter = `---
id: ${id}
type: note_draft
status: draft
created: ${dateHyphen}
updated: ${dateHyphen}
template: ${template || "none"}
source_ref: [${sourceRef.map(s => `"${s}"`).join(", ")}]
related: []
---

${linkedArticle.trim()}
`;

  // 6. Resolve naming conflict and save
  const slug = toSlug(title) || "note-draft";
  const targetDir = "memory/note/drafts";
  let finalFileName = `${dateHyphen}-${slug}.md`;

  try {
    const existingFiles = await listVaultDirectory(targetDir);
    let counter = 1;
    while (existingFiles.includes(finalFileName)) {
      counter++;
      finalFileName = `${dateHyphen}-${slug}-${counter}.md`;
    }
  } catch (e) {
    console.error(`[DEBUG] Directory check failed for ${targetDir}. Proceeding with default name.`, e);
  }

  const targetFilePath = `${targetDir}/${finalFileName}`;
  await saveVaultFile(targetFilePath, frontmatter);

  return {
    success: true,
    path: targetFilePath,
    id,
  };
}
