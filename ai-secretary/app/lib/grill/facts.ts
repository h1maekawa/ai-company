/**
 * FactResolver + Fact Providers（docs/15 D4）。
 *
 *   FactResolver
 *    ├ KnowledgeFactProvider … Knowledge Search（promoted のみ・Phase4 ADR準拠）
 *    ├ VaultFactProvider     … Vault の関連既存ファイル
 *    └ RepoFactProvider      … Repo構造・実装有無
 *
 * topic に応じて **必要なProviderだけ** を実行する（毎回全実行しない）。
 * Provider の選択は決定論的（キーワード判定）で、判断をLLMに委ねない（D7と同じ原則）。
 * 個別Providerが失敗してもResolver全体は落とさない（fail-open）。
 */

import { vaultKnowledgeSearch } from "../knowledge/search";
import { listVaultEntries } from "../vault";
import type { FactProviderId, GrillFact } from "./types";

export interface FactProvider {
  id: FactProviderId;
  /** このProviderを使うべきtopicか（決定論的判定） */
  appliesTo(topic: string): boolean;
  resolve(topic: string): Promise<GrillFact[]>;
}

/* ─── Knowledge（常時。過去の確定知見は常に効く） ─────────────── */

export const knowledgeFactProvider: FactProvider = {
  id: "knowledge",
  appliesTo: () => true,
  async resolve(topic: string): Promise<GrillFact[]> {
    // Phase4 ADR: 通常参照は promoted（Human Approved済み）のみ
    const hits = await vaultKnowledgeSearch.search({
      text: topic,
      status: ["promoted"],
      limit: 5,
    });
    return hits.map((h, i) => ({
      id: `fact-kn-${i + 1}`,
      statement: `既存Knowledge「${h.title}」（domain: ${h.domain ?? "?"}）: ${h.snippet}`,
      source: `knowledge:${h.path}`,
      provider: "knowledge" as const,
    }));
  },
};

/* ─── Vault（業務・投資・副業など「自分の記録」が効くtopic） ───── */

const VAULT_TOPIC_KEYWORDS = [
  "営業", "商談", "顧客", "kpi", "投資", "銘柄", "ポートフォリオ", "家計", "副業",
  "note", "sns", "コンテンツ", "記事", "目標", "方針", "戦略", "振り返り", "レビュー",
];

const VAULT_SCAN_DIRS = [
  "memory/personal/fund",
  "memory/personal/note",
  "memory/personal/finance",
  "memory/personal",
];

export const vaultFactProvider: FactProvider = {
  id: "vault",
  appliesTo(topic: string): boolean {
    const t = topic.toLowerCase();
    return VAULT_TOPIC_KEYWORDS.some((k) => t.includes(k));
  },
  async resolve(topic: string): Promise<GrillFact[]> {
    const t = topic.toLowerCase();
    const facts: GrillFact[] = [];
    for (const dir of VAULT_SCAN_DIRS) {
      if (facts.length >= 5) break;
      try {
        const entries = await listVaultEntries(dir);
        const related = entries
          .filter((e) => e.type === "file" && e.name.endsWith(".md"))
          .filter((e) => {
            const base = e.name.replace(/\.md$/, "").toLowerCase();
            return VAULT_TOPIC_KEYWORDS.some((k) => t.includes(k) && (base.includes(k) || t.includes(base)));
          })
          .slice(0, 3);
        for (const e of related) {
          facts.push({
            id: `fact-vault-${facts.length + 1}`,
            statement: `Vaultに関連ファイルが存在: ${dir}/${e.name}`,
            source: `vault:${dir}/${e.name}`,
            provider: "vault",
          });
        }
      } catch {
        // 個別ディレクトリの失敗は無視（fail-open）
      }
    }
    return facts;
  },
};

/* ─── Repo（システム・開発・設計topicのときだけ） ─────────────── */

const REPO_TOPIC_KEYWORDS = [
  "システム", "設計", "実装", "アーキ", "api", "github", "コード", "開発",
  "リファクタ", "バグ", "db", "データベース", "インフラ", "デプロイ", "ui", "画面",
];

/** 主要モジュールの実在チェック（重い走査はしない） */
const REPO_LANDMARKS: { path: string; label: string }[] = [
  { path: "app/lib/knowledge", label: "Knowledge基盤（domain/search/router/lifecycle）" },
  { path: "app/lib/fund", label: "Fund Policy Engine（投資判断）" },
  { path: "app/lib/investing", label: "Investing（/investing 配下の投資機能）" },
  { path: "app/lib/note", label: "Note事業部（research/publishing）" },
  { path: "app/lib/planning", label: "Morning Planning（タイムブロッキング）" },
  { path: "app/lib/skills", label: "Skills Registry（ステートレス純関数）" },
  { path: "app/lib/grill", label: "Grilling Session（本機能）" },
];

export const repoFactProvider: FactProvider = {
  id: "repo",
  appliesTo(topic: string): boolean {
    const t = topic.toLowerCase();
    return REPO_TOPIC_KEYWORDS.some((k) => t.includes(k));
  },
  async resolve(): Promise<GrillFact[]> {
    // サーバー実行時のみ fs を使う。失敗しても落とさない。
    const facts: GrillFact[] = [];
    try {
      const fs = await import("fs");
      const path = await import("path");
      const base = path.join(process.cwd(), "app");
      if (!fs.existsSync(base)) return facts;
      for (const lm of REPO_LANDMARKS) {
        const full = path.join(process.cwd(), lm.path);
        if (fs.existsSync(full)) {
          facts.push({
            id: `fact-repo-${facts.length + 1}`,
            statement: `既存実装あり: ${lm.label}（${lm.path}）`,
            source: `repo:${lm.path}`,
            provider: "repo",
          });
        }
      }
    } catch {
      // fs が使えない環境では Repo Facts なし
    }
    return facts;
  },
};

export const ALL_FACT_PROVIDERS: FactProvider[] = [
  knowledgeFactProvider,
  vaultFactProvider,
  repoFactProvider,
];

/**
 * topic に応じて必要なProviderだけを選択・実行する。
 * どのProviderが選ばれたかも返す（UI/ログで「何を調べたか」を示すため）。
 */
export async function resolveFacts(
  topic: string,
  providers: FactProvider[] = ALL_FACT_PROVIDERS
): Promise<{ facts: GrillFact[]; used: FactProviderId[] }> {
  const selected = providers.filter((p) => {
    try {
      return p.appliesTo(topic);
    } catch {
      return false;
    }
  });

  const results = await Promise.all(
    selected.map(async (p) => {
      try {
        return await p.resolve(topic);
      } catch (e) {
        console.warn(`[grill/facts] provider ${p.id} failed (non-fatal):`, e);
        return [] as GrillFact[];
      }
    })
  );

  return {
    facts: results.flat(),
    used: selected.map((p) => p.id),
  };
}
