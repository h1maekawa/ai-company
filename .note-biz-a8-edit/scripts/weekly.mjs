#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = path.join(root, "data", "kpi.csv");
const publishedDir = path.join(root, "published");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if (char === "\n" && !quoted) { row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));

function readFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end < 0) return {};
  return Object.fromEntries(
    content
      .slice(4, end)
      .split("\n")
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator < 0) return null;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
      .filter(Boolean),
  );
}

const published = fs.existsSync(publishedDir)
  ? fs.readdirSync(publishedDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => {
        const metadata = readFrontmatter(path.join(publishedDir, name));
        const fallbackSlug = name.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
        const affiliateLinks = metadata.affiliate_links ?? "";
        return {
          slug: metadata.slug || fallbackSlug,
          category: metadata.category || "未分類",
          hasAffiliate:
            metadata.affiliate === "true" ||
            (affiliateLinks !== "" && affiliateLinks !== "[]"),
        };
      })
  : [];
const publishedBySlug = new Map(published.map((article) => [article.slug, article]));
const now = new Date();
const dayMs = 86400000;
const age = (date) => Math.floor((now - new Date(`${date}T00:00:00+09:00`)) / dayMs);
const current = rows.filter((row) => age(row.date) >= 0 && age(row.date) < 7);
const previous = rows.filter((row) => age(row.date) >= 7 && age(row.date) < 14);
const sum = (items, key) => items.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const metrics = ["revenue", "sales_count", "pv", "likes"];
const label = { revenue: "売上", sales_count: "販売数", pv: "PV", likes: "スキ" };

console.log("# 週次集計の土台");
console.log(`\n対象: 直近7日 / KPI行数 ${current.length}（前期間 ${previous.length}）`);
for (const metric of metrics) {
  const currentValue = sum(current, metric);
  const previousValue = sum(previous, metric);
  const diff = currentValue - previousValue;
  const comparison = previous.length ? `${diff >= 0 ? "+" : ""}${diff}` : "比較データなし";
  console.log(`- ${label[metric]}: ${currentValue}${metric === "revenue" ? "円" : ""}（先週比 ${comparison}）`);
}
const revenue = sum(current, "revenue");
console.log(`- 月1万円目標に対する今週売上の進捗: ${(revenue / 10000 * 100).toFixed(1)}%`);

if (rows.length === 0) console.log("\nKPIデータがありません。公開後に数値を入力してください。");
else {
  console.log("\n## 記事別データ");
  for (const row of current) {
    console.log(`- ${row.title || row.article_slug}: ${row.price}円 / ${row.sales_count}件 / ${row.revenue}円 / PV ${row.pv} / スキ ${row.likes}`);
  }
}

const categoryNames = ["AI仕事術", "AIキャリア", "AI投資メモ", "未分類"];
console.log("\n## カテゴリ別データ");
for (const category of categoryNames) {
  const articles = published.filter((article) => article.category === category);
  const categoryRows = current.filter(
    (row) => (publishedBySlug.get(row.article_slug)?.category ?? "未分類") === category,
  );
  if (articles.length === 0 && categoryRows.length === 0) continue;
  console.log(
    `- ${category}: 記事 ${articles.length}件 / PV ${sum(categoryRows, "pv")} / 売上 ${sum(categoryRows, "revenue")}円`,
  );
}
console.log(`- アフィリエイトリンク設置記事: ${published.filter((article) => article.hasAffiliate).length}件`);
