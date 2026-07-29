/**
 * Note事業部のVaultストア。
 * ネタ帳・アフィリエイト案件・ブランディングを、それぞれ1ファイルで持つ。
 * 「人間可読Markdown＋末尾jsonブロック」形式（fund/planning と同じ流儀）。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import {
  AffiliateLink,
  Brand,
  Channel,
  DEFAULT_CHANNELS,
  DEFAULT_GENRES,
  Genre,
  genreOf,
  Idea,
  IDEA_STATUS_LABELS,
  TeachingProgram,
  XAccount,
  defaultBrand,
  defaultProgram,
  defaultXAccounts,
} from "./types";

const NOTE_ROOT = "memory/personal/note";
const PATHS = {
  ideas: `${NOTE_ROOT}/idea-inbox.md`,
  affiliates: `${NOTE_ROOT}/affiliate-links.md`,
  brand: `${NOTE_ROOT}/brand.md`,
} as const;

function extractJson<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

async function readJson<T>(path: string): Promise<{ data: T | null; sha?: string }> {
  try {
    const file = await getVaultFile(path);
    return { data: extractJson<T>(file.content || ""), sha: file.sha };
  } catch {
    return { data: null };
  }
}

async function write(path: string, markdown: string): Promise<void> {
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(path)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(path, markdown, sha);
}

/* ─── ネタ帳 ───────────────────────────────────────── */

type IdeaFile = { genres: Genre[]; ideas: Idea[] };

function buildIdeasMarkdown(file: IdeaFile): string {
  const byStatus = (["inbox", "planned", "drafted", "published"] as const).flatMap((status) => {
    const rows = file.ideas.filter((i) => i.status === status);
    if (rows.length === 0) return [];
    return [
      "",
      `### ${IDEA_STATUS_LABELS[status]}（${rows.length}件）`,
      ...rows.map((idea) => {
        const genre = file.genres.find((g) => g.id === idea.genreId);
        const from =
          idea.source === "morning" && idea.sourceDate
            ? `（${idea.sourceDate}の朝会より）`
            : idea.source === "chat"
              ? "（チャットより）"
              : "";
        return `- [${genre?.label ?? "未分類"}] ${idea.title} ${from}`;
      }),
    ];
  });

  return `---
type: note_idea_inbox
ideas: ${file.ideas.length}
updated: ${new Date().toISOString()}
---

# ネタ帳

記事にできそうなことを貯めておく場所です。
朝会で実際にやったことからも自動で拾います（やっていないことは入りません）。

## ジャンル

${file.genres.map((g) => `- **${g.label}** — ${g.description}`).join("\n")}

## ネタ一覧
${byStatus.join("\n")}

\`\`\`json
${JSON.stringify(file, null, 2)}
\`\`\`
`;
}

export async function loadIdeas(): Promise<IdeaFile> {
  const { data } = await readJson<IdeaFile>(PATHS.ideas);
  if (data && Array.isArray(data.ideas)) {
    return {
      genres: Array.isArray(data.genres) && data.genres.length > 0 ? data.genres : DEFAULT_GENRES,
      ideas: data.ideas,
    };
  }
  return { genres: DEFAULT_GENRES, ideas: [] };
}

export async function saveIdeas(file: IdeaFile): Promise<IdeaFile> {
  await write(PATHS.ideas, buildIdeasMarkdown(file));
  return file;
}

/* ─── アフィリエイト ───────────────────────────────── */

type AffiliateFile = { links: AffiliateLink[] };

function buildAffiliateMarkdown(file: AffiliateFile): string {
  const rows = file.links.map(
    (link) =>
      `| ${link.programName} | ${link.serviceName} | ${link.url ? "登録済み" : "**URL未登録**"} | ${link.ctaText} | ${link.active ? "有効" : "停止中"} |`
  );

  return `---
type: note_affiliate_links
links: ${file.links.length}
registered: ${file.links.filter((l) => l.url).length}
updated: ${new Date().toISOString()}
---

# アフィリエイト案件

リンクはAPIで取得できないため、すべて手入力です。
**URLが空の案件は記事に挿入されません**（AIにURLを作らせないため）。

アフィリエイトを含む記事には必ずPR表記を入れます（ステマ規制への対応）。

| 案件 | サービス | リンク | CTA | 状態 |
| --- | --- | --- | --- | --- |
${rows.join("\n") || "| （未登録） | | | | |"}

\`\`\`json
${JSON.stringify(file, null, 2)}
\`\`\`
`;
}

export async function loadAffiliates(): Promise<AffiliateLink[]> {
  const { data } = await readJson<AffiliateFile>(PATHS.affiliates);
  return data && Array.isArray(data.links) ? data.links : [];
}

export async function saveAffiliates(links: AffiliateLink[]): Promise<AffiliateLink[]> {
  await write(PATHS.affiliates, buildAffiliateMarkdown({ links }));
  return links;
}

/* ─── ブランディング ───────────────────────────────── */

type BrandFile = { brand: Brand; channels: Channel[]; program: TeachingProgram; xAccounts: XAccount[] };

function buildBrandMarkdown(file: BrandFile): string {
  const list = (items: string[]) =>
    items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "- （未記入）";

  const genreLabel = (id: string) => genreOf(DEFAULT_GENRES, id)?.label ?? id;
  const accountBlock = file.xAccounts
    .map((a, i) => {
      const genres = a.genreIds.length > 0 ? a.genreIds.map(genreLabel).join("、") : "（未割り当て）";
      const monetization = a.monetization.length > 0 ? a.monetization.join("、") : "（未設定）";
      const directAffiliate = a.directAffiliate
        ? "投稿本文に直接アフィリエイトリンクを含める（PR表記を自動付与）"
        : "投稿本文にはリンクを含めない（誘導のみ）";
      return `${i + 1}. **${a.label}**${a.handle ? ` (@${a.handle})` : ""} — ${a.role || "（役割未設定）"}\n   担当ジャンル: ${genres}\n   収益化方法: ${monetization}\n   ${directAffiliate}\n   → ${a.nextStep}`;
    })
    .join("\n");

  return `---
type: note_brand
updated: ${file.brand.updatedAt}
---

# ブランディング / マーケティング戦略

記事・X投稿・LINE配信を作るとき、AIは必ずこのファイルを前提にします。

## コンセプト

${file.brand.concept}

## 読者

${file.brand.targetReader}

### 読者の悩み
${list(file.brand.painPoints)}

## 教えること
${list(file.brand.teaches)}

## 語れる根拠（実体験・実績）
${list(file.brand.credibility)}

> ここが空だと、AIは具体的な成果を書けません（書かせません）。
> 実際にやったこと・数字を入れるほど記事の説得力が上がります。

## トーン

${file.brand.tone}

## 書かないこと
${list(file.brand.ngList)}

## 収益導線
${file.brand.funnel.map((step, i) => `${i + 1}. ${step}`).join("\n")}

## チャネルの役割
${file.channels.map((c) => `- **${c.icon} ${c.label}** — ${c.role} → ${c.nextStep}`).join("\n")}

## Xアカウント（複数運用）

Xは複数アカウントを運用し、ジャンルで自動振り分けする。

${accountBlock}

## 公式LINEで教えるプログラム

**${file.program.name}**（${file.program.duration}）

完走したら: ${file.program.promise}

${file.program.steps
  .sort((a, b) => a.order - b.order)
  .map((step) => `${step.order}. **${step.title}** — ${step.goal}${step.content ? "（配信文あり）" : "（未作成）"}`)
  .join("\n")}

\`\`\`json
${JSON.stringify(file, null, 2)}
\`\`\`
`;
}

export async function loadBrand(): Promise<BrandFile> {
  const { data } = await readJson<BrandFile>(PATHS.brand);
  if (data?.brand) {
    // 旧バージョンではXも単一チャネルとしてここに含まれていた。
    // 複数アカウント化に伴い分離したため、古いファイルに残っていれば取り除く
    const channels = (Array.isArray(data.channels) ? data.channels : []).filter(
      (c) => c.id === "note" || c.id === "line"
    );
    return {
      brand: { ...defaultBrand(), ...data.brand },
      channels: channels.length > 0 ? channels : DEFAULT_CHANNELS,
      program:
        data.program && Array.isArray(data.program.steps) ? data.program : defaultProgram(),
      xAccounts:
        Array.isArray(data.xAccounts) && data.xAccounts.length > 0
          ? (data.xAccounts as Partial<XAccount>[]).map((a) => ({
              monetization: [],
              directAffiliate: false,
              ...a,
            })) as XAccount[]
          : defaultXAccounts(),
    };
  }
  return {
    brand: defaultBrand(),
    channels: DEFAULT_CHANNELS,
    program: defaultProgram(),
    xAccounts: defaultXAccounts(),
  };
}

export async function saveBrand(file: BrandFile): Promise<BrandFile> {
  const next: BrandFile = {
    brand: { ...file.brand, updatedAt: new Date().toISOString() },
    channels: file.channels,
    program: file.program,
    xAccounts: file.xAccounts,
  };
  await write(PATHS.brand, buildBrandMarkdown(next));
  return next;
}
