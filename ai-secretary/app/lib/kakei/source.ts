import { createClient } from "@supabase/supabase-js";
import type { KakeiSource, RawTx } from "./types";

/** 【要確認A】家計簿アプリの実テーブル/カラム名に合わせてここだけ直す */
const TABLE = "transactions";
const COL = {
  id: "id",
  date: "occurred_on",
  merchant: "merchant",
  amount: "amount",
  category: "category",
  userId: "user_id",
} as const;

/** エクスポートAPI経由（家計簿アプリが {transactions:[{id,date,merchant,amount,category}]} を返す想定） */
function exportSource(): KakeiSource {
  const url = process.env.HOUSEHOLD_EXPORT_URL!;
  const token = process.env.HOUSEHOLD_EXPORT_TOKEN;
  return {
    async fetchTransactions({ from, to }) {
      const res = await fetch(`${url}?from=${from}&to=${to}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`家計簿エクスポート失敗: HTTP ${res.status}`);
      const json = (await res.json()) as { transactions?: Array<Record<string, unknown>> };
      return (json.transactions ?? []).map((r): RawTx => ({
        date: String(r.date).slice(0, 10),
        merchantRaw: String(r.merchant ?? ""),
        amount: Math.abs(Number(r.amount ?? 0)),
        category: String(r.category ?? ""),
        sourceId: String(r.id),
      }));
    },
  };
}

/** Supabase 直読み（家計簿アプリを一切触らない既定経路） */
function supabaseSource(): KakeiSource {
  const url = process.env.HOUSEHOLD_SUPABASE_URL!;
  const key = process.env.HOUSEHOLD_SUPABASE_READONLY_KEY!;
  const userId = process.env.HOUSEHOLD_USER_ID!;
  const db = createClient(url, key, { auth: { persistSession: false } });
  return {
    async fetchTransactions({ from, to }) {
      const { data, error } = await db
        .from(TABLE)
        .select(`${COL.id},${COL.date},${COL.merchant},${COL.amount},${COL.category}`)
        .eq(COL.userId, userId)
        .gte(COL.date, from)
        .lte(COL.date, to)
        .order(COL.date, { ascending: true });
      if (error) throw new Error(`家計簿Supabase読み取り失敗: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return rows.map((r): RawTx => ({
        date: String(r[COL.date]).slice(0, 10),
        merchantRaw: String(r[COL.merchant] ?? ""),
        amount: Math.abs(Number(r[COL.amount] ?? 0)),
        category: String(r[COL.category] ?? ""),
        sourceId: String(r[COL.id]),
      }));
    },
  };
}

/** env に応じてソースを選ぶ。未設定なら明示エラー */
export function createKakeiSource(): KakeiSource {
  if (process.env.HOUSEHOLD_EXPORT_URL) return exportSource();
  if (process.env.HOUSEHOLD_SUPABASE_URL) return supabaseSource();
  throw new Error("家計簿連携が未設定です（HOUSEHOLD_EXPORT_URL か HOUSEHOLD_SUPABASE_* を設定してください）");
}
