import { NextRequest, NextResponse } from "next/server";
import { listVaultDirectory, getVaultFile, saveVaultFile } from "@/app/lib/vault";
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";
import { generateUniqueId } from "@/app/lib/utils/id";
import { toSlug } from "@/app/lib/utils/slug";
import { callGroq } from "@/app/lib/ai/groq";
import { callGemini } from "@/app/lib/ai/gemini";
import { callOllama } from "@/app/lib/ai/ollama";
import { saveKnowledge } from "@/app/lib/memory/knowledge";
import { KnowledgeCategory } from "@/app/lib/parser/saveSuggestion";

const KNOWLEDGE_CATEGORIES = [
  "sales",
  "marketing",
  "recruiting",
  "investing",
  "systems",
  "content",
  "strategy",
  "misc",
];

async function callLLM(message: string, systemPrompt: string): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    return callGroq(message, systemPrompt);
  } else if (process.env.GEMINI_API_KEY) {
    return callGemini(message, systemPrompt);
  } else {
    return callOllama(message, systemPrompt);
  }
}

// Scans all category directories to find a file matching the knowledgeId, returning SHA as well
async function findKnowledgeFile(knowledgeId: string): Promise<{ path: string; content: string; sha?: string } | null> {
  const idRegex = new RegExp(`id:\\s*${knowledgeId}`);
  for (const cat of KNOWLEDGE_CATEGORIES) {
    const dir = `memory/knowledge/${cat}`;
    try {
      const fileNames = await listVaultDirectory(dir);
      for (const name of fileNames) {
        const filePath = `${dir}/${name}`;
        const { content, sha } = await getVaultFile(filePath);
        if (idRegex.test(content)) {
          return { path: filePath, content, sha };
        }
      }
    } catch (e) {
      console.warn(`[DEBUG] Failed to scan dir ${dir} while searching for knowledge ID:`, e);
    }
  }
  return null;
}

// Parses YAML Frontmatter and retrieves title and body from markdown
function parseMarkdownContent(markdown: string): { title: string; contentBody: string; frontmatter: Record<string, string> } {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = markdown.match(fmRegex);

  let body = markdown;
  let yamlStr = "";
  if (match) {
    yamlStr = match[1];
    body = match[2];
  }

  // Extract H1 title
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Untitled Promoted Note";
  const contentBody = body.replace(/^#\s+.+$/m, "").trim();

  // Simple YAML properties parser
  const frontmatter: Record<string, string> = {};
  yamlStr.split("\n").forEach((line) => {
    const index = line.indexOf(":");
    if (index !== -1) {
      const key = line.slice(0, index).trim();
      const val = line.slice(index + 1).trim();
      frontmatter[key] = val;
    }
  });

  return { title, contentBody, frontmatter };
}

function parseArray(valStr: string | undefined): string[] {
  if (!valStr) return [];
  try {
    const clean = valStr.trim().replace(/^\[|\]$/g, "");
    if (!clean) return [];
    return clean.split(",").map(item => item.trim().replace(/^"|"|^'|'$/g, ""));
  } catch (e) {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const authError = verifyApiSecret(req);
  if (authError) return authError;

  try {
    const { knowledgeId } = await req.json();
    if (!knowledgeId) {
      return NextResponse.json({ error: "knowledgeIdは必須パラメータです。" }, { status: 400 });
    }

    // 1. Locate the source knowledge file in vault
    const source = await findKnowledgeFile(knowledgeId);
    if (!source) {
      return NextResponse.json(
        { error: `指定されたID (${knowledgeId}) のナレッジが見つかりませんでした。` },
        { status: 404 }
      );
    }

    const { title, contentBody, frontmatter } = parseMarkdownContent(source.content);
    
    // Parse existing frontmatter values to carry over
    const category = (frontmatter.category || "misc") as KnowledgeCategory;
    const importance = parseInt(frontmatter.importance || "1", 10) as (1 | 2 | 3);
    const tags = parseArray(frontmatter.tags);
    const source_ref = parseArray(frontmatter.source_ref);
    const related = parseArray(frontmatter.related);

    // Extract slug from filename (removes YYYY-MM-DD- prefix and .md suffix)
    const fileName = source.path.split("/").pop() || "";
    const slug = fileName.slice(11, fileName.lastIndexOf("."));

    // 2. Update status of original Knowledge entry to "promoted"
    await saveKnowledge({
      title,
      slug,
      category,
      importance,
      content: contentBody,
      status: "promoted", // Update status
      tags,
      source_ref,
      related,
      id: knowledgeId,
      sha: source.sha,
    });

    const now = new Date();
    const dateHyphen = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 3. Create and Save Note Research File
    const researchId = await generateUniqueId("nt");
    const researchFrontmatter = `---
id: ${researchId}
type: note_research
status: research
created: ${dateHyphen}
updated: ${dateHyphen}
source_ref: ["${knowledgeId}"]
related: []
---

# ${title} (Research)

${contentBody}
`;

    const researchDir = "memory/note/research";
    let researchFileName = `${dateHyphen}-${slug}.md`;
    try {
      const files = await listVaultDirectory(researchDir);
      let c = 1;
      while (files.includes(researchFileName)) {
        c++;
        researchFileName = `${dateHyphen}-${slug}-${c}.md`;
      }
    } catch {}
    const researchPath = `${researchDir}/${researchFileName}`;
    await saveVaultFile(researchPath, researchFrontmatter);

    // 4. LLM compiles Note Draft based on Research contents
    const systemPrompt = `あなたはプロのnote記事執筆者・編集者です。
与えられたリサーチメモや箇条書きテキストに基づいて、読者の共感を呼び、わかりやすく行動を促す本格的なnote記事（下書き）を執筆してください。

以下の要件を必ず守ってください：
- 魅力的で目を引くタイトル。
- 読者の悩みに寄り添い、この記事を読むメリットを提示する導入文。
- 見出し（H2, H3）を適切に使用し、構造的で読みやすい本文。
- 記事の最後には、結論と行動喚起（CTA）を含める。
- 応答はマークダウン形式の記事本文のみを返してください。余計な説明文は含めないでください。`;

    const userMsg = `以下のリサーチ情報を元に、高品質なnote記事を執筆してください：

- **元のタイトル**: ${title}
- **リサーチ本文**: 
${contentBody}
`;

    const generatedDraft = await callLLM(userMsg, systemPrompt);

    // 5. Save Note Draft File
    const draftId = await generateUniqueId("nt");
    const draftFrontmatter = `---
id: ${draftId}
type: note_draft
status: draft
created: ${dateHyphen}
updated: ${dateHyphen}
template: auto-promoted
source_ref: ["${knowledgeId}", "${researchId}"]
related: []
---

${generatedDraft.trim()}
`;

    const draftDir = "memory/note/drafts";
    let draftFileName = `${dateHyphen}-${slug}.md`;
    try {
      const files = await listVaultDirectory(draftDir);
      let c = 1;
      while (files.includes(draftFileName)) {
        c++;
        draftFileName = `${dateHyphen}-${slug}-${c}.md`;
      }
    } catch {}
    const draftPath = `${draftDir}/${draftFileName}`;
    await saveVaultFile(draftPath, draftFrontmatter);

    return NextResponse.json({
      success: true,
      researchPath,
      researchId,
      draftPath,
      draftId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/note/promote:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
