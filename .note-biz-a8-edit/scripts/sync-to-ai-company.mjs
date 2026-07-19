#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vaultRoot =
  process.env.AI_COMPANY_VAULT_ROOT ||
  "/Users/maekawahiroyuki/Library/CloudStorage/Dropbox/maehiro/個人用/AI会社";
const noteRoot = path.join(vaultRoot, "memory", "personal", "note");
const overwrite = process.argv.includes("--overwrite");

const copyPlan = [
  { source: "research", target: "research", type: "directory" },
  { source: "drafts", target: "drafts", type: "directory" },
  { source: "published", target: "published", type: "directory" },
  { source: "templates", target: "templates", type: "directory" },
  { source: "data/kpi.csv", target: "kpi.csv", type: "file" },
  { source: "data/affiliate-links.csv", target: "affiliate/affiliate-links.csv", type: "file" },
  { source: "README.md", target: "affiliate/note-biz-README.md", type: "file" },
];

const totals = { copied: 0, skipped: 0, warned: 0 };

function warning(message) {
  totals.warned += 1;
  console.warn(`[warn] ${message}`);
}

function copyFile(source, target) {
  if (fs.existsSync(target) && !overwrite) {
    totals.skipped += 1;
    console.log(`[skip] ${path.relative(repoRoot, source)} -> ${target}`);
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  totals.copied += 1;
  console.log(`[copy] ${path.relative(repoRoot, source)} -> ${target}`);
}

function copyDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    warning(`source directory not found: ${sourceDir}`);
    return;
  }
  if (!fs.statSync(sourceDir).isDirectory()) {
    warning(`source is not a directory: ${sourceDir}`);
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(source, target);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
      copyFile(source, target);
    }
  }
}

console.log("note-biz -> AI会社Vault sync");
console.log(`mode: ${overwrite ? "overwrite" : "skip existing"}`);
console.log(`source: ${repoRoot}`);
console.log(`target: ${noteRoot}`);

try {
  fs.mkdirSync(noteRoot, { recursive: true });

  for (const item of copyPlan) {
    const source = path.join(repoRoot, item.source);
    const target = path.join(noteRoot, item.target);

    if (item.type === "directory") {
      copyDirectory(source, target);
      continue;
    }

    if (!fs.existsSync(source)) {
      warning(`source file not found: ${source}`);
      continue;
    }
    if (!fs.statSync(source).isFile()) {
      warning(`source is not a file: ${source}`);
      continue;
    }
    copyFile(source, target);
  }
} catch (error) {
  console.error(`[error] sync failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  console.log(
    `Done. copied=${totals.copied}, skipped=${totals.skipped}, warned=${totals.warned}`,
  );
}
