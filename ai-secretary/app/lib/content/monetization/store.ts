/**
 * Monetization Core の Vault ストア。既存Note事業部と同じ
 * 「人間可読Markdown＋末尾jsonブロック」形式。ファイルが無ければ安全な既定値を返す。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import {
  Campaign,
  Conversion,
  CTA,
  defaultMonetizationPolicy,
  MonetizationPolicy,
  Offer,
  RevenueEvent,
} from "./types";

const ROOT = "memory/personal/note";

export const MONETIZATION_PATHS = {
  offers: `${ROOT}/offers.md`,
  ctaLibrary: `${ROOT}/cta-library.md`,
  ledger: `${ROOT}/monetization-ledger.md`,
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

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const file = await getVaultFile(path);
    return extractJson<T>(file.content || "");
  } catch {
    return null;
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

function buildDoc(title: string, note: string, humanBody: string, data: unknown): string {
  return `---
type: ${title}
updated: ${new Date().toISOString()}
---

# ${title}

${note}

${humanBody}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
}

/* ─── Offer / Campaign / Policy ──────────────────────── */

export type OffersFile = {
  offers: Offer[];
  campaigns: Campaign[];
  policy: MonetizationPolicy;
};

export async function loadOffers(): Promise<OffersFile> {
  const data = await readJson<OffersFile>(MONETIZATION_PATHS.offers);
  return {
    offers: Array.isArray(data?.offers) ? data.offers : [],
    campaigns: Array.isArray(data?.campaigns) ? data.campaigns : [],
    policy: data?.policy ?? defaultMonetizationPolicy(),
  };
}

export async function saveOffers(file: OffersFile): Promise<OffersFile> {
  const human = [
    "## Offer Library",
    file.offers
      .map((o) => `- [${o.status}] **${o.name}**（${o.type}）${o.price ? ` ¥${o.price}` : ""}`)
      .join("\n") || "（まだありません）",
    "",
    "## Campaign",
    file.campaigns
      .map((c) => `- [${c.status}] **${c.name}** — ${c.goal}`)
      .join("\n") || "（まだありません）",
    "",
    "## Monetization Policy",
    `- 有効な収益源: ${file.policy.allowedOfferTypes.join("、") || "（未設定）"}`,
    `- 禁止カテゴリ: ${file.policy.prohibitedCategories.join("、") || "（なし）"}`,
    `- Affiliate表記: ${file.policy.affiliateDisclosure}`,
  ].join("\n");

  await write(
    MONETIZATION_PATHS.offers,
    buildDoc(
      "note_offers",
      "紹介する商品・サービスの一覧です。記事ごとにURLを毎回打たず、ここから選びます。有効化されていない種類をAIが勝手に推薦することはありません。",
      human,
      file
    )
  );
  return file;
}

/* ─── CTA Library ─────────────────────────────────────── */

export type CtaFile = { ctas: CTA[] };

export async function loadCtaLibrary(): Promise<CTA[]> {
  const data = await readJson<CtaFile>(MONETIZATION_PATHS.ctaLibrary);
  return Array.isArray(data?.ctas) ? data.ctas : [];
}

export async function saveCtaLibrary(ctas: CTA[]): Promise<CTA[]> {
  const human = ctas.map((c) => `- [${c.type}] **${c.name}** — ${c.text}`).join("\n") || "（まだありません）";
  await write(
    MONETIZATION_PATHS.ctaLibrary,
    buildDoc("note_cta_library", "再利用可能なCTA（Call To Action）の一覧です。", human, { ctas })
  );
  return ctas;
}

/* ─── Monetization Ledger（Conversion / RevenueEvent） ─── */

export type LedgerFile = { conversions: Conversion[]; revenueEvents: RevenueEvent[] };

export async function loadLedger(): Promise<LedgerFile> {
  const data = await readJson<LedgerFile>(MONETIZATION_PATHS.ledger);
  return {
    conversions: Array.isArray(data?.conversions) ? data.conversions : [],
    revenueEvents: Array.isArray(data?.revenueEvents) ? data.revenueEvents : [],
  };
}

export async function saveLedger(file: LedgerFile): Promise<LedgerFile> {
  const totalRevenue = file.revenueEvents.reduce((sum, r) => sum + r.amount, 0);
  const human = [
    `Conversion: ${file.conversions.length}件 / RevenueEvent: ${file.revenueEvents.length}件`,
    `累計Revenue（記録通貨混在の単純合計・目安）: ${totalRevenue}`,
    "",
    "> Revenueは manual / 正式API / import のみを記録します。AIが金額を生成することはありません。",
    "",
    "## 直近のRevenueEvent",
    file.revenueEvents
      .slice(0, 30)
      .map((r) => `- ${r.occurredAt.slice(0, 10)} [${r.type}] ${r.amount}${r.currency}（${r.source}）`)
      .join("\n") || "（まだありません）",
  ].join("\n");

  await write(
    MONETIZATION_PATHS.ledger,
    buildDoc(
      "note_monetization_ledger",
      "Conversion・Revenueの正データです。AIは生成せず、本人入力・正式API・importのみを記録します。",
      human,
      file
    )
  );
  return file;
}
