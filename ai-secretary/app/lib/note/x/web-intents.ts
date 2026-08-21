import { normalizeXHandle } from "./urls";

const INTENT_BASE = "https://twitter.com/intent";
export const X_POST_LIMIT = 280;

export function countXCharacters(text: string): number {
  return Array.from(text).length;
}

function intent(path: string, params: Record<string, string | undefined>): string {
  const url = new URL(`${INTENT_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

export const buildXComposeIntent = (text: string, url?: string) =>
  intent("tweet", { text, url });
export const buildXReplyIntent = (postId: string, text?: string) => {
  if (!/^\d{5,30}$/.test(postId)) throw new Error("ポストIDが不正です");
  return intent("tweet", { in_reply_to: postId, text });
};
export const buildXRepostIntent = (postId: string) => {
  if (!/^\d{5,30}$/.test(postId)) throw new Error("ポストIDが不正です");
  return intent("retweet", { tweet_id: postId });
};
export const buildXLikeIntent = (postId: string) => {
  if (!/^\d{5,30}$/.test(postId)) throw new Error("ポストIDが不正です");
  return intent("like", { tweet_id: postId });
};
export const buildXFollowIntent = (username: string) => {
  const handle = normalizeXHandle(username);
  if (!handle) throw new Error("Xアカウント名が不正です");
  return intent("follow", { screen_name: handle });
};

export function openXIntent(url: string): boolean {
  if (typeof window === "undefined") return false;
  return window.open(url, "_blank", "noopener,noreferrer,width=720,height=760") !== null;
}
export const openXComposeIntent = (text: string, url?: string) =>
  openXIntent(buildXComposeIntent(text, url));
export const openXReplyIntent = (postId: string, text?: string) =>
  openXIntent(buildXReplyIntent(postId, text));
export const openXRepostIntent = (postId: string) => openXIntent(buildXRepostIntent(postId));
export const openXLikeIntent = (postId: string) => openXIntent(buildXLikeIntent(postId));
export const openXFollowIntent = (username: string) => openXIntent(buildXFollowIntent(username));
