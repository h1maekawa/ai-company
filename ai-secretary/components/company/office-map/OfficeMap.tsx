"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/primitives";
import { useCompanyOffice } from "../office/useCompanyOffice";
import { Lobby } from "./Lobby";
import { RoomTile } from "./RoomTile";
import { buildRooms, type ConnectionsSummary, type HomeSummary } from "./roomModel";

/**
 * 3x3の床。中央がLobby。
 *
 * grid-template-areas は使わない（CSS変数越しの参照はブレークポイントによって
 * 安定して無効化されず、狭い画面でも3列のまま崩れる実機バグを確認したため）。
 * 代わりにDOM順 + Tailwind標準の order-N だけで組み立てる。
 * モバイル（orderなし）はDOM順＝Lobbyが先頭、lg以上だけ3x3に並び替える。
 */
const ROOM_ORDER_CLASS: Record<string, string> = {
  operations: "lg:order-1",
  knowledge: "lg:order-2",
  creator: "lg:order-3",
  fund: "lg:order-4",
  human: "lg:order-6",
  execution: "lg:order-7",
  engineering: "lg:order-8",
  planning: "lg:order-9",
};
const LOBBY_ORDER_CLASS = "lg:order-5";

export function OfficeMap() {
  const { view, loading: officeLoading } = useCompanyOffice();
  const [homeSummary, setHomeSummary] = useState<HomeSummary>();
  const [homeSummaryUnavailable, setHomeSummaryUnavailable] = useState(false);
  const [connections, setConnections] = useState<ConnectionsSummary>();

  const router = useRouter();
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room");
  const roomRefs = useRef(new Map<string, HTMLDivElement | null>());

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/company/home-summary", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("HOME_SUMMARY_UNAVAILABLE");
        return response.json() as Promise<HomeSummary>;
      })
      .then(setHomeSummary)
      .catch(() => {
        if (!controller.signal.aborted) setHomeSummaryUnavailable(true);
      });
    void fetch("/api/system/connections", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("CONNECTIONS_UNAVAILABLE");
        return response.json() as Promise<ConnectionsSummary>;
      })
      .then(setConnections)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const rooms = useMemo(() => {
    if (!view) return [];
    const built = buildRooms(view.departments, homeSummary);
    const services = connections?.services ?? [];
    if (services.length > 0) {
      const connected = services.filter((service) => service.status === "connected").length;
      return built.map((room) =>
        room.id === "engineering" ? { ...room, currentWork: [`接続 ${connected}/${services.length}`] } : room,
      );
    }
    return built;
  }, [view, homeSummary, connections]);

  useEffect(() => {
    if (!roomParam) return;
    const target = roomRefs.current.get(roomParam);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [roomParam, rooms.length]);

  const setRoomRef = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      roomRefs.current.set(id, node);
    },
    [],
  );

  const copyRoomLink = useCallback(
    (id: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set("room", id);
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
      void navigator.clipboard?.writeText(url.toString()).catch(() => undefined);
    },
    [router],
  );

  if (officeLoading || !view) {
    return <Skeleton className="h-[640px] rounded-2xl" />;
  }

  const byId = (id: string) => rooms.find((room) => room.id === id);
  const order = ["operations", "knowledge", "creator", "fund", "human", "execution", "engineering", "planning"];
  const extraRooms = rooms.filter((room) => !order.includes(room.id));

  return (
    <div className="space-y-3">
      <header className="rounded-2xl border border-hairline bg-ink-card px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand">Office Map</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">2D フロアマップ</h1>
            <p className="mt-1 text-xs text-sub">会社全体の事業領域を、部屋として一望する（read-only）</p>
          </div>
          <dl className="flex flex-wrap gap-2">
            <div className="flex items-baseline gap-1.5 rounded-lg border border-hairline bg-white/[0.03] px-2.5 py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-sub">稼働中</dt>
              <dd className="text-xs font-semibold text-slate-200">{view.people.working} 人</dd>
            </div>
            <div className="flex items-baseline gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5">
              <dt className="text-[10px] uppercase tracking-wide text-amber-200/80">確認</dt>
              <dd className="text-xs font-semibold text-amber-200">
                {homeSummaryUnavailable ? "UNKNOWN" : (homeSummary?.attention.length ?? "…")}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="grid auto-rows-[minmax(150px,1fr)] grid-cols-1 gap-3 rounded-2xl border border-hairline bg-ink-card/60 p-3 lg:grid-cols-3">
        <Lobby summary={homeSummary} summaryUnavailable={homeSummaryUnavailable} orderClassName={LOBBY_ORDER_CLASS} />
        {order.map((id) => {
          const room = byId(id);
          if (!room) return null;
          return (
            <div key={id} id={`room-${id}`} className={`group relative ${ROOM_ORDER_CLASS[id] ?? ""}`}>
              <RoomTile ref={setRoomRef(id)} room={room} highlighted={roomParam === id} />
              <button
                type="button"
                onClick={() => copyRoomLink(id)}
                aria-label={`${room.zoneLabel}へのリンクをコピー`}
                className="absolute right-1 top-1 hidden rounded-md border border-white/10 bg-ink-card/80 px-1 text-[9px] text-sub group-hover:block"
              >
                🔗
              </button>
            </div>
          );
        })}
      </div>

      {extraRooms.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {extraRooms.map((room) => (
            <RoomTile key={room.id} ref={setRoomRef(room.id)} room={room} highlighted={roomParam === room.id} />
          ))}
        </div>
      )}
    </div>
  );
}
