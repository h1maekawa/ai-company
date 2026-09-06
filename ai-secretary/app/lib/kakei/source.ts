import { createClient } from "@supabase/supabase-js";
import type { KakeiSource, RawTx } from "./types";

/**
 * 家計簿アプリ（household-finance）の実スキーマ。
 * supabase/migrations の transactions テーブルに合わせている。
 *
 * 注意点が2つある:
 * - 店名の専用カラムが無い。手入力・チャット入力・Gmail取込のいずれも
 *   店名は memo に入るので、これを merchantRaw として扱う。
 * - kind で収入と支出を分けている。フィルタしないと収入が支出に混ざる。
 * category は manual_category を設定すると同じ値で更新されるため、
 * category だけ読めばユーザーの手修正も反映される。
 */
const TABLE = "transactions";
const COL = {
  id: "id",
  date: "date",
  merchant: "memo",
  amount: "amount",
  category: "category",
  userId: "user_id",
  kind: "kind",
} as const;
const EXPENSE_KIND = "expense";

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
        .eq(COL.kind, EXPENSE_KIND)
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
