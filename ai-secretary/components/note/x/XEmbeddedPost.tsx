"use client";
import { useEffect, useRef, useState } from "react";
import { parseXPostUrl } from "@/app/lib/note/x/urls";
import { loadXWidgets } from "./widgets";

export function XEmbeddedPost({ url }: { url: string }) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const parsed = parseXPostUrl(url);
  useEffect(() => {
    setHtml(""); setError("");
    if (!parsed) return;
    fetch(`/api/note/x/oembed?url=${encodeURIComponent(parsed.canonicalUrl)}`)
      .then(async (res) => {
        const data = await res.json() as { html?: string; error?: string };
        if (!res.ok || !data.html) throw new Error(data.error);
        setHtml(data.html);
      }).catch((e) => setError(e instanceof Error ? e.message : "表示できません"));
  }, [parsed?.canonicalUrl]);
  useEffect(() => {
    if (!html || !root.current) return;
    loadXWidgets().then(() => root.current && window.twttr?.widgets?.load(root.current)).catch(() => {});
  }, [html]);
  if (!url) return null;
  if (!parsed) return <p className="text-xs text-loss">`https://x.com/ユーザー名/status/数字` の形式で入力してください。</p>;
  return <div>
    {html && <div ref={root} dangerouslySetInnerHTML={{ __html: html }} />}
    {error && <p className="text-xs text-loss">{error}</p>}
    <a href={parsed.canonicalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand underline">Xで開く</a>
  </div>;
}
