import Link from "next/link";
import { forwardRef } from "react";
import { PixelEmployee } from "../office/PixelEmployee";
import { STATUS_DOT, poseOf } from "../office/types";
import type { RoomView } from "./roomModel";
import { ROOM_STATUS_DOT, ROOM_STATUS_LABEL, ROOM_THEME } from "./theme";

/** 床タイルの軽量表現。画像を増やさず、CSSのグラデーションだけで床らしさを出す。 */
const FLOOR_TILE = {
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 18px), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 18px)",
};

export const RoomTile = forwardRef<HTMLDivElement, { room: RoomView; highlighted?: boolean }>(
  function RoomTile({ room, highlighted }, ref) {
    const theme = ROOM_THEME[room.theme];

    const body = (
      <div
        style={FLOOR_TILE}
        className={`relative flex h-full flex-col overflow-hidden rounded-xl border-2 ${theme.wall} ${theme.floor} p-3 transition-all ${
          highlighted ? "ring-2 ring-offset-2 ring-offset-ink-card ring-brand" : ""
        }`}
      >
        {/* 軽量な家具・観葉植物。部屋の雰囲気づけだけが目的で、クリックやデータは持たない */}
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-2 -right-2 text-4xl opacity-[0.12]">
          {theme.furniture}
        </span>

        <header className="relative flex items-start justify-between gap-2">
          {/* channelsがある部屋はbody全体をLinkにできない（中のバッジがLinkのため <a> の入れ子になる）。
              その場合はタイトルだけをLinkにして部署画面への導線を保つ。 */}
          {room.channels && room.href ? (
            <Link href={room.href} className={`flex items-center gap-1.5 text-xs font-semibold ${theme.accent} hover:underline`}>
              <span aria-hidden="true">{room.icon}</span>
              {room.zoneLabel}
            </Link>
          ) : (
            <h3 className={`flex items-center gap-1.5 text-xs font-semibold ${theme.accent}`}>
              <span aria-hidden="true">{room.icon}</span>
              {room.zoneLabel}
            </h3>
          )}
          <span className="flex items-center gap-1 text-[10px] text-sub">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ROOM_STATUS_DOT[room.status]}`} />
            {ROOM_STATUS_LABEL[room.status]}
          </span>
        </header>

        {room.attentionCount > 0 && (
          <p className="relative mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200">
            確認 {room.attentionCount}件
          </p>
        )}

        {room.channels && (
          <ul className="relative mt-2 flex flex-wrap gap-1">
            {room.channels.map((channel) => (
              <li key={channel.id}>
                {channel.enabled && channel.href ? (
                  <Link
                    href={channel.href}
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-slate-200 hover:bg-white/[0.08]"
                  >
                    {channel.label}
                  </Link>
                ) : (
                  <span className="rounded-full border border-dashed border-white/10 px-1.5 py-0.5 text-[9px] text-sub" title="今回はまだ実装していません">
                    {channel.label} 準備中
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="relative mt-2 flex-1">
          {room.agents.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {room.agents.map((agent) => (
                <li key={agent.agentId} title={`${agent.name} · ${agent.status}`} className="flex flex-col items-center gap-0.5">
                  <PixelEmployee pose={poseOf(agent.status)} compact />
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] leading-relaxed text-sub">{room.description}</p>
          )}
        </div>

        {room.currentWork?.[0] && <p className="relative mt-1 truncate text-[9px] text-slate-300">{room.currentWork[0]}</p>}
      </div>
    );

    return (
      <div ref={ref} className="min-h-32">
        {room.href && !room.channels ? (
          <Link href={room.href} aria-label={`${room.zoneLabel}の画面を開く`} className="block h-full">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
    );
  },
);
