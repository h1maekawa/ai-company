#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const vaultRoot =
  process.env.VAULT_ROOT ||
  "/Users/maekawahiroyuki/Library/CloudStorage/Dropbox/maehiro/個人用/AI会社";
const overwrite = process.argv.includes("--overwrite");

const copyPlan = [
  ["memory/personal", "memory/personal"],
  ["memory/company", "memory/company"],
  ["memory/brain", "memory/brain"],
  ["memory/note/templates", "memory/personal/note/templates"],
];

function copyMissingFiles(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return { copied: 0, skipped: 0 };
  fs.mkdirSync(targetDir, { recursive: true });

  let copied = 0;
  let skipped = 0;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      const result = copyMissingFiles(sourcePath, targetPath);
      copied += result.copied;
      skipped += result.skipped;
      continue;
    }

    if (!entry.isFile()) continue;

    if (!overwrite && fs.existsSync(targetPath)) {
      skipped++;
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
    copied++;
  }

  return { copied, skipped };
}

if (!fs.existsSync(vaultRoot)) {
  console.error(`Vault root does not exist: ${vaultRoot}`);
  process.exit(1);
}

let totalCopied = 0;
let totalSkipped = 0;

for (const [sourceRel, targetRel] of copyPlan) {
  const sourceDir = path.join(repoRoot, sourceRel);
  const targetDir = path.join(vaultRoot, targetRel);
  const result = copyMissingFiles(sourceDir, targetDir);
  totalCopied += result.copied;
  totalSkipped += result.skipped;
  console.log(`${sourceRel} -> ${targetRel}: copied ${result.copied}, skipped ${result.skipped}`);
}

console.log(`Done. copied=${totalCopied}, skipped=${totalSkipped}, vault=${vaultRoot}`);
