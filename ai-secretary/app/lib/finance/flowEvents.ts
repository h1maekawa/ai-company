import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type FlowCardEvent = { event: "card_transaction.created"; transactionId: string; date: string; merchant: string; amount: number; card: string; count?: number };
const WINDOW_MS = 5 * 60_000;

export function verifyFlowSignature(raw: string, timestamp: string | null, signature: string | null, secret: string | undefined, now = Date.now()): boolean {
  if (!secret || !timestamp || !signature || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > WINDOW_MS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const supplied = signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

export function parseFlowCardEvent(raw: string): FlowCardEvent | null {
  let value: Record<string, unknown>;
  try { value = JSON.parse(raw); } catch { return null; }
  if (value.event !== "card_transaction.created" || typeof value.transactionId !== "string" || !/^[\w:-]{1,120}$/.test(value.transactionId)) return null;
  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value.date)) return null;
  if (typeof value.merchant !== "string" || value.merchant.length > 100 || typeof value.card !== "string" || value.card.length > 80) return null;
  if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0) return null;
  if (value.count !== undefined && (typeof value.count !== "number" || !Number.isInteger(value.count) || value.count < 1 || value.count > 100)) return null;
  return { event: "card_transaction.created", transactionId: value.transactionId, date: value.date, merchant: value.merchant, amount: value.amount, card: value.card, count: value.count as number | undefined };
}

export const flowEventFingerprint = (event: FlowCardEvent) => `flow:card_transaction:${event.transactionId}`;
