/**
 * Note事業部のVaultストア。
 * ネタ帳・アフィリエイト案件・ブランディングを、それぞれ1ファイルで持つ。
 * 「人間可読Markdown＋末尾jsonブロック」形式（fund/planning と同じ流儀）。
 */

import { getVaultFile, saveVaultFile } from "../vault";
import {
  AffiliateLink,
  ALL_GENRE_IDS,
  BRAND_VERSION,
  Brand,
  Channel,
  DEFAULT_CHANNELS,
  DEFAULT_GENRES,
  Genre,
  genreOf,
  Idea,
  IDEA_STATUS_LABELS,
  LEGACY_DEFAULT_BRAND_TEXT,
  TeachingProgram,
  XAccount,
  defaultBrand,
  defaultProgram,
  defaultXAccounts,
  migrateBrandV1ToV2,
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

type IdeaFile = { genresVersion?: string; genres: Genre[]; ideas: Idea[] };

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
    if (data.genresVersion !== BRAND_VERSION) {
      // 旧ジャンル体系（副業教育メディア期）から「まえみち」の5ジャンルへ一回だけ移行。
      // 既存のネタ（ideas）はgenreIdが旧idのままでも削除しない
      // （genreOfが見つからない場合はUI側で「未分類」表示になり、書き直せば再割り当てできる）
      const migrated: IdeaFile = { genresVersion: BRAND_VERSION, genres: DEFAULT_GENRES, ideas: data.ideas };
      await saveIdeas(migrated);
      return migrated;
    }
    return {
      genresVersion: data.genresVersion,
      genres: Array.isArray(data.genres) && data.genres.length > 0 ? data.genres : DEFAULT_GENRES,
      ideas: data.ideas,
    };
  }
  return { genresVersion: BRAND_VERSION, genres: DEFAULT_GENRES, ideas: [] };
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

const BRAND_ASSET_PATHS = [
  "/brand/maemichi/icon.png",
  "/brand/maemichi/x-header.png",
  "/brand/maemichi/note-profile.png",
  "/brand/maemichi/og-default.png",
] as const;

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

  const { identity, personality, visualIdentity } = file.brand;

  return `---
type: note_brand
updated: ${file.brand.updatedAt}
---

# ${identity.name} — ブランディング

${identity.primaryTagline}

記事・X投稿・LINE配信を作るとき、AIは必ずこのファイルを前提にします。

## ブランド基本情報

- **ブランド名**: ${identity.name}
- **メインキャッチコピー**: ${identity.primaryTagline}
- **ブランドストーリーコピー**: ${identity.storyTagline}
- **サブコピー**
${list(identity.alternateTaglines)}
- **コンセプト**: ${file.brand.concept}

## ブランド全体のゴール

${file.brand.brandGoal}

## 投稿割合

| ジャンル | 目標割合 |
| --- | ---: |
${file.brand.contentPillars.map((pillar) => `| ${pillar.label} | ${pillar.targetRatio}% |`).join("\n")}

## Xの発信ルール

**目的**
${list(file.brand.channelGuidelines.x.purpose)}

**口調**
${list(file.brand.channelGuidelines.x.tone)}

**ルール**
${list(file.brand.channelGuidelines.x.rules)}

## noteの発信ルール

**目的**
${list(file.brand.channelGuidelines.note.purpose)}

**口調**
${list(file.brand.channelGuidelines.note.tone)}

**ルール**
${list(file.brand.channelGuidelines.note.rules)}

## プロフィール

### Xプロフィール
${identity.xProfile}

### Xプロフィール（短縮版）
${identity.xProfileShort}

### noteプロフィール
${identity.noteProfile}

### 固定ポスト
${identity.fixedPost}

## 人格・口調

**性格**: ${personality.traits.join("、")}

**基本姿勢**
${list(personality.basicStance)}

**使用したい表現**
${list(personality.preferredExpressions)}

**避ける表現**
${list(personality.avoidedExpressions)}

**文章ルール**
${list(personality.writingRules)}

## 読者

${file.brand.targetReader}

### 読者の悩み
${list(file.brand.painPoints)}

## 発信・共有すること
${list(file.brand.teaches)}

## 語れる根拠（実体験・実績）
${list(file.brand.credibility)}

> 具体的な売上・投資利益・フォロワー数などの数値は、ここに本人が登録した場合のみ使います。
> 上記が数字を含まない実践事実だけの間は、AIは収益額や成果の数字を一切書きません。

## トーン（要約）

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

## ビジュアル方針

**ブランドカラー**
- ベース: ${visualIdentity.baseColor}
- サーフェス: ${visualIdentity.surfaceColor}
- アクセント: ${visualIdentity.accentColor}
- テキスト: ${visualIdentity.textColor}
- サブテキスト: ${visualIdentity.subTextColor}
- セカンダリ: ${visualIdentity.secondaryColor}

**イラストの方針**
${list(visualIdentity.illustrationStyle)}

**アイコンの方針**
${list(visualIdentity.iconGuidelines)}

**ヘッダーの方針**
${list(visualIdentity.headerGuidelines)}

**アセット配置先**（画像は未生成でも画面は壊れません）
${BRAND_ASSET_PATHS.map((p) => `- ${p}`).join("\n")}

\`\`\`json
${JSON.stringify(file, null, 2)}
\`\`\`
`;
}

/** 値が旧デフォルトのままか（＝前川さんが編集していないか）を判定する */
function unchanged<T>(value: T, legacy: T): boolean {
  return JSON.stringify(value) === JSON.stringify(legacy);
}

/**
 * 旧ブランド（副業教育メディア期）から「まえみち」への一回限りの移行。
 * 前川さんが実際に編集した項目（旧デフォルトと一致しない項目）は上書きしない。
 * identity/personality/visualIdentityは今回新設したフィールドなので必ず新規に埋める。
 */
function migrateBrandToMaemichi(old: Brand): Brand {
  const fresh = defaultBrand();
  return {
    ...old,
    identity: fresh.identity,
    personality: fresh.personality,
    visualIdentity: fresh.visualIdentity,
    concept: unchanged(old.concept, LEGACY_DEFAULT_BRAND_TEXT.concept) ? fresh.concept : old.concept,
    targetReader: unchanged(old.targetReader, LEGACY_DEFAULT_BRAND_TEXT.targetReader)
      ? fresh.targetReader
      : old.targetReader,
    painPoints: unchanged(old.painPoints, LEGACY_DEFAULT_BRAND_TEXT.painPoints)
      ? fresh.painPoints
      : old.painPoints,
    teaches: unchanged(old.teaches, LEGACY_DEFAULT_BRAND_TEXT.teaches) ? fresh.teaches : old.teaches,
    // 旧デフォルトのcredibilityは空配列だった。前川さんが何か登録済みなら残す
    credibility: old.credibility.length === 0 ? fresh.credibility : old.credibility,
    tone: unchanged(old.tone, LEGACY_DEFAULT_BRAND_TEXT.tone) ? fresh.tone : old.tone,
    ngList: unchanged(old.ngList, LEGACY_DEFAULT_BRAND_TEXT.ngList) ? fresh.ngList : old.ngList,
    funnel: unchanged(old.funnel, LEGACY_DEFAULT_BRAND_TEXT.funnel) ? fresh.funnel : old.funnel,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Xアカウントの移行。
 * 全アカウントが未入力（空のデフォルト）なら1つの「まえみち」アカウントへ統合する。
 * 実データが入っているアカウントがあれば、先頭を「まえみち」に変えて新ジャンルを全部割り当て、
 * 他のアカウントはデータを消さずジャンル割り当てだけ解除する（後から再設定できる）。
 */
function migrateXAccountsToMaemichi(existing: XAccount[]): XAccount[] {
  const isUntouched = (a: XAccount) =>
    !a.handle && !a.role && a.genreIds.length === 0 && a.monetization.length === 0;

  if (existing.length === 0 || existing.every(isUntouched)) {
    return defaultXAccounts();
  }

  const [first, ...rest] = existing;
  const maemichi: XAccount = {
    ...first,
    label: "まえみち",
    genreIds: [...ALL_GENRE_IDS],
  };
  const others = rest.map((a) => ({ ...a, genreIds: [] }));
  return [maemichi, ...others];
}

export async function loadBrand(): Promise<BrandFile> {
  const { data } = await readJson<BrandFile>(PATHS.brand);

  // 旧バージョンではXも単一チャネルとしてここに含まれていた。
  // 複数アカウント化に伴い分離したため、古いファイルに残っていれば取り除く
  const channels = (Array.isArray(data?.channels) ? data.channels : []).filter(
    (c) => c.id === "note" || c.id === "line"
  );
  const program = data?.program && Array.isArray(data.program.steps) ? data.program : defaultProgram();
  const savedXAccounts: XAccount[] =
    Array.isArray(data?.xAccounts) && data.xAccounts.length > 0
      ? ((data.xAccounts as Partial<XAccount>[]).map((a) => ({
          monetization: [],
          directAffiliate: false,
          ...a,
        })) as XAccount[])
      : [];

  if (!data?.brand) {
    return {
      brand: defaultBrand(),
      channels: channels.length > 0 ? channels : DEFAULT_CHANNELS,
      program,
      xAccounts: savedXAccounts.length > 0 ? savedXAccounts : defaultXAccounts(),
    };
  }

  if (data.brand.identity?.version === BRAND_VERSION) {
    const defaults = defaultBrand();
    const saved = data.brand;
    return {
      brand: {
        ...defaults,
        ...saved,
        identity: { ...defaults.identity, ...saved.identity },
        personality: { ...defaults.personality, ...saved.personality },
        visualIdentity: { ...defaults.visualIdentity, ...saved.visualIdentity },
        channelGuidelines: {
          x: { ...defaults.channelGuidelines.x, ...saved.channelGuidelines?.x },
          note: { ...defaults.channelGuidelines.note, ...saved.channelGuidelines?.note },
        },
      },
      channels: channels.length > 0 ? channels : DEFAULT_CHANNELS,
      program,
      xAccounts: savedXAccounts.length > 0 ? savedXAccounts : defaultXAccounts(),
    };
  }

  if (data.brand.identity?.version === "maemichi-v1") {
    const brand = migrateBrandV1ToV2(data.brand);
    const defaults = defaultXAccounts()[0];
    const xAccounts = (savedXAccounts.length > 0 ? savedXAccounts : defaultXAccounts()).map((account) =>
      account.id === "maemichi" && account.role.includes("AI・副業・読書・資産形成・習慣について")
        ? { ...account, role: defaults.role, nextStep: defaults.nextStep, genreIds: [...ALL_GENRE_IDS] }
        : account
    );
    const migrated: BrandFile = {
      brand,
      channels: channels.length > 0 ? channels : DEFAULT_CHANNELS,
      program,
      xAccounts,
    };
    await saveBrand(migrated);
    return migrated;
  }

  // 「まえみち」ブランドへの一回限りの移行。移行後は保存して以後は再実行しない
  const migrated: BrandFile = {
    brand: migrateBrandToMaemichi(data.brand),
    channels: channels.length > 0 ? channels : DEFAULT_CHANNELS,
    program,
    xAccounts: migrateXAccountsToMaemichi(savedXAccounts),
  };
  await saveBrand(migrated);
  return migrated;
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
