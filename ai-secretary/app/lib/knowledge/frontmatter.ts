/**
 * 最小の frontmatter パーサ（外部依存なし）。
 * Knowledge Markdown の `---` ブロックを field→string に、本文を body に分離する。
 * 配列は `[a, b]` / 複数行 `- a` の両形式をゆるく解釈する。
 */

export interface ParsedDoc {
  data: Record<string, string | string[]>;
  body: string;
  /** frontmatter 内の生テキスト（デバッグ用） */
  raw: string;
}

function stripQuotes(s: string): string {
  return s.trim().replace(/^["']/, "").replace(/["']$/, "").trim();
}

function parseInlineArray(value: string): string[] {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!inner.trim()) return [];
  return inner
    .split(",")
    .map((v) => stripQuotes(v))
    .filter(Boolean);
}

export function parseFrontmatter(content: string): ParsedDoc {
  const text = content ?? "";
  const m = text.match(/^﻿?---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) {
    return { data: {}, body: text, raw: "" };
  }
  const raw = m[1];
  const body = m[2] ?? "";
  const data: Record<string, string | string[]> = {};

  const lines = raw.split("\n");
  let currentListKey: string | null = null;
  const listBuffer: Record<string, string[]> = {};

  for (const line of lines) {
    if (/^\s*-\s+/.test(line) && currentListKey) {
      listBuffer[currentListKey].push(stripQuotes(line.replace(/^\s*-\s+/, "")));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) {
      currentListKey = null;
      continue;
    }
    const key = kv[1];
    const val = kv[2];
    if (val.trim() === "") {
      // 次行以降が `- item` のリストになりうる
      currentListKey = key;
      listBuffer[key] = [];
      continue;
    }
    currentListKey = null;
    if (val.trim().startsWith("[")) {
      data[key] = parseInlineArray(val);
    } else {
      data[key] = stripQuotes(val);
    }
  }

  for (const [k, arr] of Object.entries(listBuffer)) {
    if (arr.length > 0) data[k] = arr;
  }

  return { data, body, raw };
}

export function asString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join(", ");
  return v ?? "";
}

export function asArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  return [v];
}
