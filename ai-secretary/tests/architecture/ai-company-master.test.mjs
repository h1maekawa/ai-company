import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("AI Company Master SSOT contains the required foundation contracts", () => {
  const master = read("docs/AI_COMPANY_MASTER.md");
  for (const section of [
    "## Vision",
    "## Architecture",
    "## Core Systems and SSOT",
    "## Canonical Artifacts",
    "## Human Gates",
    "## Current Production State",
    "## Task Board",
    "## Next PRs",
    "## Decision Log",
    "## Protected Boundaries",
  ]) assert.match(master, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(master, /External World[\s\S]*Research[\s\S]*Knowledge[\s\S]*Opportunity[\s\S]*Mission[\s\S]*Execution[\s\S]*Result[\s\S]*Performance[\s\S]*Revenue[\s\S]*Learning[\s\S]*Next Opportunity/);
  assert.match(master, /no automatic investment trade/);
  assert.match(master, /Missing data is not zero/);
});

test("repository agent guide requires the Master SSOT before implementation", () => {
  const guide = read("../AGENTS.md");
  assert.match(guide, /read `ai-secretary\/docs\/AI_COMPANY_MASTER\.md` in full/);
});
