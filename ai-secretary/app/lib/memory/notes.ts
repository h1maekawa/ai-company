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
  const systemPrompt = `あなたは前川弘行専属のnote記事執筆AIです。
アフィリエイト収益（Phase1）と有料コンテンツ販売（Phase2）の両軸で、読者の行動を引き出す高CVR記事を生成します。

## 必須ルール
1. 導入は以下の3フックパターンから最適なものを選んで書く
   - 【損益提示型】「この記事に書かれていることを知らずに〇〇万円の損失を出しました」
   - 【常識破壊型】「〇〇を頑張っている人ほど、実は収益化から遠ざかっています」
   - 【権威性×ギャップ型】「凡人サラリーマンが仕事終わり1時間で〇〇を自動化した方法」
2. 本文の自然な流れの中にアフィリリンク挿入箇所を【アフィリ挿入: 案件名】と明示する
3. 記事末尾には必ず以下CTAテンプレートのいずれかを使う
   - 「公式LINEでは本記事の〇〇テンプレートを無料プレゼント中」
   - 「この戦略の具体的な実装方法はこちらの記事で解説→【リンク】」
   - 「ここから先の具体的な〇〇は有料パートで公開しています」
4. 見出しはH2・H3を使い、一文を短く（40文字以内）
5. 精神論・抽象論・モチベーション論は一切書かない

${templateContent ? `\n## テンプレート構成（必ず準拠する）\n${templateContent}\n` : ""}
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
