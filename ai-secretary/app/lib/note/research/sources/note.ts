/**
 * noteの公開情報リサーチ。
 *
 * 取得するのは公開ページに出ている情報だけ:
 *   タイトル / 公開日時 / スキ数 / 有料無料 / タグ / 著者
 * 公開されていない閲覧数・売上は取得も推測もしない。
 *
 * 1つのページが落ちてもリサーチ全体は止めない。
 */

import { DEFAULT_GENRES } from "../../types";
import { fetchPage, hashId, stripTags } from "../fetcher";
import { detectGenres } from "../genres";
import { ReferenceNoteCreator, ResearchItem, ResearchSourceType } from "../types";

export { detectGenres } from "../genres";

/**
 * noteの公開APIから、必要な公開項目だけ拾う。
 *
 * 注意: エンドポイントによって命名規則が違う。
 *   /api/v2/creators/... → camelCase（noteUrl あり）
 *   /api/v3/hashtags/... → snake_case（noteUrl 無し。key と user.urlname から組み立てる）
 * どちらでも読めるよう両方を受け付ける。
 */
type NoteApiNote = {
  key?: string;
  name?: string;
  noteUrl?: string;
  publishAt?: string;
  publish_at?: string;
  likeCount?: number;
  like_count?: number;
  price?: number;
  body?: string;
  user?: { nickname?: string; name?: string; urlname?: string };
  hashtags?: { hashtag?: { name?: string } }[];
};

type NoteApiListResponse = {
  data?: { notes?: NoteApiNote[]; contents?: NoteApiNote[] };
};

/** noteUrl が無い応答（v3）でも記事URLを組み立てる */
function noteUrlOf(note: NoteApiNote): string | null {
  if (note.noteUrl) return note.noteUrl;
  const urlname = note.user?.urlname;
  if (urlname && note.key) return `https://note.com/${urlname}/n/${note.key}`;
  return null;
}

const MAX_PER_SOURCE = 10;

/** 本文の全文は保持しない。判断に必要な冒頭だけ */
function excerpt(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function toResearchItem(
  note: NoteApiNote,
  sourceType: ResearchSourceType,
  sourceAccountId?: string
): ResearchItem | null {
  const title = note.name?.trim();
  const url = noteUrlOf(note);
  if (!title || !url) return null;

  const tags = (note.hashtags ?? [])
    .map((h) => h.hashtag?.name)
    .filter((n): n is string => Boolean(n));

  const body = note.body ? stripTags(note.body) : "";
  const haystack = [title, tags.join(" "), body.slice(0, 400)].join(" ");

  // エンドポイントによって camelCase / snake_case が混在する
  const likes = note.likeCount ?? note.like_count;

  return {
    id: hashId("r", url),
    platform: "note",
    sourceType,
    sourceAccountId,
    sourceUrl: url,
    title,
    textExcerpt: excerpt(body || title),
    authorName: note.user?.nickname ?? note.user?.name,
    publishedAt: note.publishAt ?? note.publish_at,
    // note が公開しているのはスキ数まで。閲覧数・売上は取らない
    publicMetrics: typeof likes === "number" ? { likes } : undefined,
    detectedGenreIds: detectGenres(haystack),
    fetchedAt: new Date().toISOString(),
  };
}

function parseNotes(body: string): NoteApiNote[] {
  try {
    const json = JSON.parse(body) as NoteApiListResponse;
    return json.data?.notes ?? json.data?.contents ?? [];
  } catch {
    return [];
  }
}

export type NoteResearchResult = {
  items: ResearchItem[];
  /** 取得に失敗したソース。全体は失敗させず、ここに理由を残す */
  failures: { source: string; error: string }[];
};

/** 参考クリエイターの新着・人気記事 */
async function fetchCreator(creator: ReferenceNoteCreator): Promise<NoteResearchResult> {
  const urlname = creator.creatorUrl.replace(/\/+$/, "").split("/").pop();
  if (!urlname) {
    return { items: [], failures: [{ source: creator.name, error: "URLからユーザー名を判別できません" }] };
  }

  const items: ResearchItem[] = [];
  const failures: { source: string; error: string }[] = [];

  for (const [label, url] of [
    ["新着", `https://note.com/api/v2/creators/${encodeURIComponent(urlname)}/contents?kind=note&page=1`],
    ["人気", `https://note.com/api/v2/creators/${encodeURIComponent(urlname)}/contents?kind=note&page=1&sort=popular`],
  ] as const) {
    const res = await fetchPage(url);
    if (!res.ok) {
      failures.push({ source: `${creator.name}(${label})`, error: res.error });
      continue;
    }
    for (const note of parseNotes(res.body).slice(0, MAX_PER_SOURCE)) {
      const item = toResearchItem(note, "reference-account", creator.id);
      if (item) items.push(item);
    }
  }

  return { items, failures };
}

/** タグの人気・新着記事（ハッシュタグは v3 のみ提供されている） */
async function fetchTag(tag: string): Promise<NoteResearchResult> {
  const items: ResearchItem[] = [];
  const failures: { source: string; error: string }[] = [];
  // 人気順だけだと毎回同じ記事になるため、新着順も取得する。
  const results = await Promise.all(
    ([["人気", "popular"], ["新着", "new"]] as const).map(async ([label, order]) => {
      const url = `https://note.com/api/v3/hashtags/${encodeURIComponent(tag)}/notes?order=${order}&page=1`;
      const res = await fetchPage(url);
      if (!res.ok) {
        return {
          items: [] as ResearchItem[],
          failure: { source: `タグ:${tag}(${label})`, error: res.error },
        };
      }
      const fetchedItems: ResearchItem[] = [];
      for (const note of parseNotes(res.body).slice(0, MAX_PER_SOURCE)) {
        const item = toResearchItem(note, "trend");
        if (item) fetchedItems.push(item);
      }
      return { items: fetchedItems };
    })
  );
  for (const result of results) {
    items.push(...result.items);
    if (result.failure) failures.push(result.failure);
  }
  return { items, failures };
}

/**
 * noteリサーチ本体。
 * 参考クリエイターと対象タグを巡回し、取得できたものだけを返す。
 */
export async function researchNote(
  creators: ReferenceNoteCreator[],
  tags: string[],
  options?: { focusTopic?: string }
): Promise<NoteResearchResult> {
  const items: ResearchItem[] = [];
  const failures: { source: string; error: string }[] = [];
  const focusTopic = options?.focusTopic?.trim();

  const activeCreators = creators
    .filter((c) => c.active)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 10);

  // Slackでテーマを指定された場合は、そのタグだけを調べる。
  // 参考アカウントと全登録タグを毎回巡回するとVercelの実行時間を超え、
  // 「受付しました」のまま完了通知が返らなくなるため。
  if (!focusTopic) {
    for (const creator of activeCreators) {
      const result = await fetchCreator(creator);
      items.push(...result.items);
      failures.push(...result.failures);
    }
  }

  const targetTags = focusTopic ? [focusTopic] : tags.slice(0, 12);
  for (const tag of targetTags) {
    const result = await fetchTag(tag);
    items.push(...result.items);
    failures.push(...result.failures);
  }

  // 同じURLは1件にまとめる
  const byUrl = new Map<string, ResearchItem>();
  for (const item of items) {
    if (!byUrl.has(item.sourceUrl)) byUrl.set(item.sourceUrl, item);
  }

  return { items: [...byUrl.values()], failures };
}

/** ジャンルidから表示名 */
export function genreLabel(id: string): string {
  return DEFAULT_GENRES.find((g) => g.id === id)?.label ?? id;
}
