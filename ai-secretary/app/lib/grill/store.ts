/**
 * GrillSessionStore（docs/15 D3）。
 *
 *   Domain / Application
 *          ↓
 *   GrillSessionStore (interface)   ← ここ
 *          ↓
 *   Redis実装 / File実装 / （将来）Supabase実装
 *
 * 永続性の定義（重要）:
 *   Production(Vercel): Redis = Session State の唯一の永続実体。/tmp は temporary fallback のみで
 *   永続化とは扱わない（インスタンス毎に揮発するため）。
 *   Redis保存に失敗しても Grilling は継続するが、durability: "volatile" を返し
 *   UIに「このセッションは再開保証されません」と表示させる。
 *
 * Supabase未設定・Redis未設定でも動作すること（ADR-E継承）。
 */

import fs from "fs";
import path from "path";
import {
  GRILL_KEYS,
  isRedisAvailable,
  redisSafeGet,
  redisTrySet,
} from "../utils/redis";
import type { GrillSession, GrillSessionSummary, PersistResult } from "./types";
import { toSummary } from "./designTree";

export interface GrillSessionStore {
  save(session: GrillSession): Promise<PersistResult>;
  load(id: string): Promise<GrillSession | null>;
  listActive(): Promise<GrillSessionSummary[]>;
}

/* ─── File backend（開発環境の実体 / 本番では /tmp フォールバック） ───────── */

const isVercel = Boolean(process.env.VERCEL);

/** 開発: Vault配下のAI Managed領域。本番: /tmp（揮発・永続とは扱わない）。 */
function sessionsDir(): { dir: string; backend: "file" | "tmp" } {
  if (isVercel) return { dir: "/tmp/grill-sessions", backend: "tmp" };
  const root = process.env.VAULT_ROOT || process.cwd();
  return { dir: path.join(root, "memory/personal/grilling/sessions"), backend: "file" };
}

function fileWrite(session: GrillSession): { ok: boolean; backend: "file" | "tmp" } {
  const { dir, backend } = sessionsDir();
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${session.id}.json`), JSON.stringify(session, null, 2), "utf-8");
    return { ok: true, backend };
  } catch (err) {
    console.warn("[grill/store] file write failed", err);
    return { ok: false, backend };
  }
}

function fileRead(id: string): GrillSession | null {
  const { dir } = sessionsDir();
  try {
    const p = path.join(dir, `${id}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as GrillSession;
  } catch {
    return null;
  }
}

function fileList(): GrillSession[] {
  const { dir } = sessionsDir();
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as GrillSession;
        } catch {
          return null;
        }
      })
      .filter((x): x is GrillSession => x !== null);
  } catch {
    return [];
  }
}

/* ─── 既定実装: Redis優先 + File ─────────────────────────────────── */

export const grillSessionStore: GrillSessionStore = {
  async save(session: GrillSession): Promise<PersistResult> {
    const redisOk = isRedisAvailable
      ? await redisTrySet(GRILL_KEYS.session(session.id), session)
      : false;

    if (redisOk) {
      // activeなセッションIDの索引を更新（再開一覧用）
      try {
        const ids = (await redisSafeGet<string[]>(GRILL_KEYS.activeIndex)) ?? [];
        const next =
          session.status === "active" || session.status === "ready_for_confirmation"
            ? Array.from(new Set([session.id, ...ids]))
            : ids.filter((x) => x !== session.id);
        await redisTrySet(GRILL_KEYS.activeIndex, next);
      } catch {
        // 索引更新の失敗は致命ではない
      }
    }

    const file = fileWrite(session);

    if (redisOk) {
      return { durability: "durable", backend: "redis" };
    }

    // Redisに書けなかった: 本番は /tmp（揮発）＝ volatile、開発は file を永続実体とみなす
    if (file.ok && file.backend === "file") {
      return { durability: "durable", backend: "file" };
    }
    if (file.ok && file.backend === "tmp") {
      return {
        durability: "volatile",
        backend: "tmp",
        warning: isRedisAvailable
          ? "Redisへの保存に失敗しました（一時領域にのみ保存）。"
          : "Redisが未設定のため一時領域にのみ保存しました。",
      };
    }
    return {
      durability: "volatile",
      backend: "none",
      warning: "セッションを保存できませんでした。",
    };
  },

  async load(id: string): Promise<GrillSession | null> {
    if (isRedisAvailable) {
      const fromRedis = await redisSafeGet<GrillSession>(GRILL_KEYS.session(id));
      if (fromRedis) return fromRedis;
    }
    return fileRead(id);
  },

  async listActive(): Promise<GrillSessionSummary[]> {
    const seen = new Map<string, GrillSession>();

    if (isRedisAvailable) {
      const ids = (await redisSafeGet<string[]>(GRILL_KEYS.activeIndex)) ?? [];
      for (const id of ids) {
        const s = await redisSafeGet<GrillSession>(GRILL_KEYS.session(id));
        if (s) seen.set(s.id, s);
      }
    }

    for (const s of fileList()) {
      if (!seen.has(s.id)) seen.set(s.id, s);
    }

    return [...seen.values()]
      .filter((s) => s.status === "active" || s.status === "ready_for_confirmation")
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
      .map(toSummary);
  },
};
