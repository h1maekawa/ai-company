export type CareerSocialPlatform = "instagram" | "x";

/** Only a direct HTTPS account profile can become a public CTA. */
export function validateCareerSocialUrl(platform: CareerSocialPlatform, value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hosts = platform === "instagram" ? ["instagram.com", "www.instagram.com"] : ["x.com", "www.x.com", "twitter.com", "www.twitter.com"];
    const account = url.pathname.split("/").filter(Boolean);
    const validHandle = platform === "instagram" ? /^[A-Za-z0-9._]{1,30}$/ : /^[A-Za-z0-9_]{1,15}$/;
    const reserved = new Set(platform === "instagram" ? ["accounts", "direct", "explore", "reels", "stories", "p"] : ["home", "intent", "search", "settings", "i", "messages"]);
    if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || account.length !== 1 || !validHandle.test(account[0]) || reserved.has(account[0].toLowerCase())) return null;
    return `https://${url.hostname}/${account[0]}/`;
  } catch {
    return null;
  }
}

export function careerSocialLinks(config: { instagram?: string; x?: string }) {
  return {
    instagram: validateCareerSocialUrl("instagram", config.instagram),
    x: validateCareerSocialUrl("x", config.x),
  };
}
