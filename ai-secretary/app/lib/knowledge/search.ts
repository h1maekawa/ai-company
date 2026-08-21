/**
 * Knowledge 検索（ADR-D, docs/14）。
 *
 * 方針:
 * - metadata + 全文 + 簡易ranking。semantic/vector は使わず、まず正確でデバッグ可能な検索。
 * - 検索ロジックと Index 保存先を分離する（SearchRepository interface）。
 *   既定実装 VaultKnowledgeSearch は Vault を都度走査（Index 無し）。
 *   将来 Supabase の Index/Embedding 実装を同 interface でドロップインできる。
 * - Index/Embedding は派生データ。正本は Obsidian Markdown。
 */

import { vaultDocumentStore } from "../persistence/vaultStore";
import { CANONICAL_DOMAINS, resolveDomain, type CanonicalDomain } from "./domain";
import { parseFrontmatter, asArray, asString } from "./frontmatter";
import { isKnowledgeStatus, type KnowledgeStatus } from "./types";

export interface KnowledgeQuery {
  /** フリーワード（空なら metadata フィルタのみ） */
  text?: string;
  domains?: string[];
  tags?: string[];
  status?: KnowledgeStatus[];
  /** importance 下限 */
  minImportance?: 1 | 2 | 3;
  limit?: number;
}

export interface KnowledgeHit {
  path: string;
  id: string;
  title: string;
  domain: CanonicalDomain | null;
  status: string;
  importance: number;
  managed_by: string;
  tags: string[];
  updated: string;
  score: number;
  /** マッチ箇所の要約（デバッグ/表示用） */
  matchedIn: string[];
  snippet: string;
}

export interface SearchRepository {
  search(query: KnowledgeQuery): Promise<KnowledgeHit[]>;
}

const KNOWLEDGE_ROOT = "memory/knowledge";

// ADR-D ranking weights（title exact > tag > title partial > heading > metadata > body）
const W = {
  titleExact: 100,
  tagMatch: 60,
  titlePartial: 40,
  headingMatch: 25,
  metadataMatch: 15,
  bodyMatch: 8,
} as const;

function firstHeadingTitle(body: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
}

function makeSnippet(body: string, needle: string): string {
  const plain = body.replace(/^#.*$/gm, "").trim();
  if (!needle) return plain.slice(0, 140).replace(/\s+/g, " ").trim();
  const idx = plain.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return plain.slice(0, 140).replace(/\s+/g, " ").trim();
  const start = Math.max(0, idx - 50);
  return ("…" + plain.slice(start, start + 140) + "…").replace(/\s+/g, " ").trim();
}

/**
 * 1ファイルに対するスコアリング。text が空でもフィルタを通れば score>=1 で残す。
 */
function scoreDoc(
  query: KnowledgeQuery,
  parsed: ReturnType<typeof parseFrontmatter>
): { score: number; matchedIn: string[] } | null {
  const data = parsed.data;
  const domainRaw = asString(data.domain) || asString(data.category);
  const resolvedDomain = resolveDomain(domainRaw).domain;
  const tags = asArray(data.tags).map((t) => t.toLowerCase());
  const status = asString(data.status);
  const importance = parseInt(asString(data.importance) || "1", 10) || 1;

  // ---- metadata フィルタ（AND） ----
  if (query.domains && query.domains.length > 0) {
    const wanted = query.domains.map((d) => resolveDomain(d).domain).filter(Boolean);
    if (!resolvedDomain || !wanted.includes(resolvedDomain)) return null;
  }
  if (query.status && query.status.length > 0) {
    if (!isKnowledgeStatus(status) || !query.status.includes(status)) return null;
  }
  if (query.tags && query.tags.length > 0) {
    const wantTags = query.tags.map((t) => t.toLowerCase());
    if (!wantTags.some((t) => tags.includes(t))) return null;
  }
  if (query.minImportance && importance < query.minImportance) return null;

  const matchedIn: string[] = [];
  let score = 0;

  const text = (query.text || "").trim().toLowerCase();
  const title = (firstHeadingTitle(parsed.body) || asString(data.id)).toLowerCase();

  if (!text) {
    // フィルタのみ: importance で薄く付ける
    score = importance;
  } else {
    const headings = (parsed.body.match(/^#{1,6}\s+.*$/gm) || []).join("\n").toLowerCase();
    const metaBlob = [
      asString(data.domain),
      asString(data.category),
      asString(data.source_ref),
      asString(data.related),
    ]
      .join(" ")
      .toLowerCase();
    const body = parsed.body.toLowerCase();

    // 質問文はフレーズ全体では一致しないことが多いため、語に分割して語ごとに採点する。
    // （例:「ヒアリング 商談 受注率」→ 3語それぞれを各フィールドに照合）
    const terms = text
      .split(/[\s\u3000、。,.:;!?・/|「」『』（）()\[\]]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
    const needles = terms.length > 0 ? terms : [text];

    // フレーズ全体がタイトルと完全一致 / 部分一致した場合は最優先で加点
    if (title && title === text) {
      score += W.titleExact;
      matchedIn.push("title:exact");
    } else if (title && title.includes(text)) {
      score += W.titlePartial;
      matchedIn.push("title:partial");
    }

    let matchedTerms = 0;
    for (const needle of needles) {
      let best = 0;
      let where = "";
      if (title && title === needle) {
        best = W.titleExact;
        where = "title:exact";
      } else if (tags.some((t) => t.includes(needle) || needle.includes(t))) {
        best = W.tagMatch;
        where = "tag";
      } else if (title.includes(needle)) {
        best = W.titlePartial;
        where = "title:partial";
      } else if (headings.includes(needle)) {
        best = W.headingMatch;
        where = "heading";
      } else if (metaBlob.includes(needle)) {
        best = W.metadataMatch;
        where = "metadata";
      } else if (body.includes(needle)) {
        best = W.bodyMatch;
        where = "body";
      }
      if (best > 0) {
        matchedTerms++;
        score += best;
        if (!matchedIn.includes(where)) matchedIn.push(where);
      }
    }

    if (score === 0) return null;

    // 質問の語をどれだけ広くカバーできたか（部分一致だけの文書より、全語一致を上位に）
    const coverage = matchedTerms / needles.length;
    score += Math.round(coverage * 20);

    // importance / recency の軽い加点
    score += importance;
    const updated = asString(data.updated);
    if (updated) {
      const ageDays = (Date.now() - new Date(updated).getTime()) / 86_400_000;
      if (!Number.isNaN(ageDays)) {
        if (ageDays < 30) score += 5;
        else if (ageDays < 120) score += 2;
      }
    }
  }

  return { score, matchedIn };
}

export const vaultKnowledgeSearch: SearchRepository = {
  async search(query: KnowledgeQuery): Promise<KnowledgeHit[]> {
    const limit = query.limit ?? 10;
    // 対象 domain のディレクトリだけ走査（指定が無ければ全 canonical domain）
    const targetDomains =
      query.domains && query.domains.length > 0
        ? Array.from(new Set(query.domains.map((d) => resolveDomain(d).domain).filter(Boolean)))
        : [...CANONICAL_DOMAINS];

    const hits: KnowledgeHit[] = [];

    for (const dom of targetDomains as CanonicalDomain[]) {
      const dir = `${KNOWLEDGE_ROOT}/${dom}`;
      let files: string[] = [];
      try {
        files = await vaultDocumentStore.listFiles(dir);
      } catch {
        files = [];
      }
      for (const name of files) {
        if (!name.endsWith(".md")) continue;
        const path = `${dir}/${name}`;
        let content = "";
        try {
          content = (await vaultDocumentStore.getFile(path)).content || "";
        } catch {
          continue;
        }
        if (!content.trim()) continue;
        const parsed = parseFrontmatter(content);
        const scored = scoreDoc(query, parsed);
        if (!scored) continue;

        const data = parsed.data;
        const domainRaw = asString(data.domain) || asString(data.category);
        hits.push({
          path,
          id: asString(data.id),
          title: firstHeadingTitle(parsed.body) || name.replace(/\.md$/, ""),
          domain: resolveDomain(domainRaw).domain,
          status: asString(data.status),
          importance: parseInt(asString(data.importance) || "1", 10) || 1,
          managed_by: asString(data.managed_by) || "human",
          tags: asArray(data.tags),
          updated: asString(data.updated),
          score: scored.score,
          matchedIn: scored.matchedIn,
          snippet: makeSnippet(parsed.body, query.text || ""),
        });
      }
    }

    hits.sort((a, b) => b.score - a.score || (b.updated > a.updated ? 1 : -1));
    return hits.slice(0, limit);
  },
};
