"use client";

import { useState } from "react";
import type { VisualIdentity } from "@/app/lib/note/types";
import { Card, CardHeader } from "@/components/ui/primitives";

const ASSETS: { key: string; path: string; label: string }[] = [
  { key: "icon", path: "/brand/maemichi/icon.png", label: "アイコン" },
  { key: "x-header", path: "/brand/maemichi/x-header.png", label: "Xヘッダー" },
  { key: "note-profile", path: "/brand/maemichi/note-profile.png", label: "noteプロフィール画像" },
  { key: "og-default", path: "/brand/maemichi/og-default.png", label: "OG画像" },
];

/** 画像が未生成でも壊れず「未生成」と表示するサムネイル */
function AssetThumb({ path, label }: { path: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-white/[0.02]">
      <div className="flex aspect-video items-center justify-center bg-black/20">
        {failed ? (
          <span className="px-2 text-center text-[10px] text-sub">未生成</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={path}
            alt={label}
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <p className="px-2 py-1.5 text-[10px] text-sub">{label}</p>
    </div>
  );
}

function Swatch({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-6 w-6 shrink-0 rounded-full border border-white/10" style={{ backgroundColor: hex }} />
      <div className="min-w-0">
        <p className="text-[10px] text-sub">{label}</p>
        <p className="font-mono text-[11px] text-white">{hex}</p>
      </div>
    </div>
  );
}

/** ブランドカラーとアセット配置先のプレビュー。画像未生成でも画面は壊れない */
export function BrandPreview({ visual }: { visual: VisualIdentity }) {
  return (
    <Card>
      <CardHeader
        title="プレビュー"
        hint="画像は未生成でも表示は壊れません（後から差し替えられる配置先だけ用意しています）"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Swatch label="ベース" hex={visual.baseColor} />
        <Swatch label="サーフェス" hex={visual.surfaceColor} />
        <Swatch label="アクセント" hex={visual.accentColor} />
        <Swatch label="テキスト" hex={visual.textColor} />
        <Swatch label="サブテキスト" hex={visual.subTextColor} />
        <Swatch label="セカンダリ" hex={visual.secondaryColor} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ASSETS.map((a) => (
          <AssetThumb key={a.key} path={a.path} label={a.label} />
        ))}
      </div>
    </Card>
  );
}
