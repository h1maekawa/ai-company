"use client";
import { useEffect, useRef, useState } from "react";
import { loadXWidgets } from "./widgets";
import { normalizeXHandle, xProfileUrl } from "@/app/lib/note/x/urls";

export function XEmbeddedTimeline({ handle, height = 650 }: { handle: string; height?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const normalized = normalizeXHandle(handle);
  const url = normalized ? xProfileUrl(normalized) : null;
  useEffect(() => {
    setError("");
    if (!root.current || !url) return;
    loadXWidgets().then(() => root.current && window.twttr?.widgets?.load(root.current))
      .catch(() => setError("X公式タイムラインを読み込めませんでした"));
  }, [url]);
  if (!url) return <p className="p-4 text-xs text-sub">公開Xアカウント名を選択してください。</p>;
  return <div ref={root} key={url} style={{ minHeight: height }}>
    <a className="twitter-timeline" data-theme="dark" data-height={String(height)} data-dnt="true" href={url}>
      @{normalized} の公開タイムラインを読み込み中…
    </a>
    {error && <p className="mt-2 text-xs text-loss">{error} <a href={url} target="_blank" rel="noopener noreferrer" className="underline">Xで開く</a></p>}
  </div>;
}
