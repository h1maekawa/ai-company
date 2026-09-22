import type { ResearchProvider, ResearchProviderItem } from "./types";
import { EXTERNAL_CONTENT_CLASSIFICATION, untrustedExternalText } from "./externalSecurity";
import { searchSerpApi, type SerpOrganicResult } from "../../note/research/serpapiClient";

type SearchClient = (query:string,maxResults:number,freshness?:string)=>Promise<SerpOrganicResult[]>;

function permitted(urlValue: string, allowed: string[] = [], blocked: string[] = []) {
  try {
    const host = new URL(urlValue).hostname.toLowerCase();
    const matches = (domain: string) => host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`);
    return !blocked.some(matches) && (!allowed.length || allowed.some(matches));
  } catch { return false; }
}

export function createWebSearchProvider(search: SearchClient = searchSerpApi): ResearchProvider {
  return { id: "serpapi-web", sourceType: "web", async search(query) {
    const items: ResearchProviderItem[] = (await search(query.topic,query.maxItems,query.freshness)).flatMap((row) => {
      if (!row.title || !row.link || !permitted(row.link, query.allowedDomains, query.blockedDomains)) return [];
      return [{ title: untrustedExternalText(row.title, 240), summary: untrustedExternalText(row.snippet ?? row.title), sourceUrl: row.link, sourceName: untrustedExternalText(row.source ?? new URL(row.link).hostname, 120), publishedAt: row.date, reliability: query.allowedDomains?.length ? "HIGH" : "MEDIUM", tags: [EXTERNAL_CONTENT_CLASSIFICATION] }];
    });
    return { items: items.slice(0, query.maxItems), checkedAt: new Date().toISOString() };
  } };
}
