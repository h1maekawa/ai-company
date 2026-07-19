#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [draftArg, priceArg, publicUrl = ""] = process.argv.slice(2);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (!draftArg || priceArg === undefined) {
  fail("Usage: node scripts/publish.mjs <draft-file> <price> [public-url]");
}

const price = Number(priceArg);
if (!Number.isInteger(price) || price < 0) fail("price must be a non-negative integer");
if (publicUrl && !/^https:\/\//.test(publicUrl)) fail("public URL must start with https://");

const draftsDir = path.join(root, "drafts");
const requested = path.resolve(root, draftArg);
const source = draftArg.startsWith("drafts/") ? requested : path.join(draftsDir, path.basename(draftArg));
const relative = path.relative(draftsDir, source);
if (relative.startsWith("..") || path.isAbsolute(relative)) fail("draft must be inside drafts/");
if (!fs.existsSync(source) || !fs.statSync(source).isFile()) fail(`draft not found: ${draftArg}`);

let content = fs.readFileSync(source, "utf8");
const unsupportedAffiliate = /(af\.moshimo\.com|rakuten\.co\.jp|楽天アフィリエイト)/i;
if (unsupportedAffiliate.test(content)) fail("unsupported affiliate reference found; only approved A8/Amazon links are allowed");

const hasAffiliate = /(amazon\.(co\.jp|com)|a8\.net|affiliate:\s*true|affiliate_links:\s*\[(?!\s*\]))/i.test(content);
if (hasAffiliate && !/※本記事には広告・アフィリエイトリンクが含まれます。/.test(content)) {
  fail("affiliate content requires the disclosure near the beginning of the article");
}

const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const fallbackSlug = path.basename(source, path.extname(source)).replace(/^\d{4}-\d{2}-\d{2}-/, "");
const titleMatch = content.match(/^title:\s*["']?(.*?)["']?\s*$/m);
const headingMatch = content.match(/^#\s+(.+)$/m);
const title = (titleMatch?.[1] || headingMatch?.[1] || fallbackSlug).trim();
const slugMatch = content.match(/^slug:\s*["']?(.*?)["']?\s*$/m);
const slug = (slugMatch?.[1] || fallbackSlug).trim();

function setFrontmatter(input, fields) {
  const lines = input.startsWith("---\n") ? input.split("\n") : ["---", "---", "", ...input.split("\n")];
  let end = lines.indexOf("---", 1);
  if (end < 0) fail("invalid frontmatter");
  for (const [key, value] of Object.entries(fields)) {
    const index = lines.slice(1, end).findIndex((line) => line.startsWith(`${key}:`));
    const rendered = `${key}: ${JSON.stringify(value)}`;
    if (index >= 0) lines[index + 1] = rendered;
    else lines.splice(end++, 0, rendered);
  }
  return lines.join("\n");
}

content = setFrontmatter(content, {
  status: "published",
  published_at: date,
  price,
  url: publicUrl,
});

const target = path.join(root, "published", path.basename(source));
if (fs.existsSync(target)) fail(`published file already exists: ${path.relative(root, target)}`);
fs.writeFileSync(target, content, "utf8");
fs.unlinkSync(source);

const csvPath = path.join(root, "data", "kpi.csv");
const csv = fs.readFileSync(csvPath, "utf8");
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const row = [date, slug, title, price, 0, 0, 0, 0, "公開時登録"].map(escapeCsv).join(",");
const existingSlugs = csv.split(/\r?\n/).slice(1).map((line) => line.split(",")[1]);
if (existingSlugs.includes(slug)) fail(`KPI row already exists for slug: ${slug}`);
fs.appendFileSync(csvPath, `${csv.endsWith("\n") ? "" : "\n"}${row}\n`, "utf8");

console.log(`Published record: ${path.relative(root, target)}`);
console.log(`KPI row added: ${slug}`);
