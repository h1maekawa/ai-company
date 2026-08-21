import { execFileSync } from "child_process";
import { readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { parseXArchiveTweetsJs, isSafeArchiveEntry, isTweetArchiveEntry } from "../app/lib/note/x/archive";
import { mergeOwnedPosts } from "../app/lib/note/x/store";
import type { XWorkspaceData } from "../app/lib/note/x/types";

const input = process.argv[2];
const write = process.argv.includes("--write");
const accountArg = process.argv.find((arg) => arg.startsWith("--account="));
const accountId = accountArg?.slice("--account=".length) || "maemichi";
if (!input) throw new Error("使い方: npm run import:x-archive -- <ZIPまたは展開済みフォルダ> [--account=maemichi] [--write]");
const resolved = path.resolve(input);
const stats = statSync(resolved);
if (stats.isFile() && stats.size > 2 * 1024 * 1024 * 1024) throw new Error("ZIPは2GB以下にしてください");

let contents: string[] = [];
if (stats.isDirectory()) {
  const candidates = ["data/tweets.js", ...Array.from({ length: 100 }, (_, i) => `data/tweets-part${i}.js`)];
  contents = candidates.map((name) => path.join(resolved, name)).filter(existsSync).map((file) => {
    if (statSync(file).size > 100 * 1024 * 1024) throw new Error("投稿ファイルが100MBを超えています");
    return readFileSync(file, "utf8");
  });
} else if (resolved.toLowerCase().endsWith(".zip")) {
  const entries = execFileSync("unzip", ["-Z1", resolved], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
    .split("\n").map((s) => s.trim()).filter(Boolean);
  if (entries.some((name) => !isSafeArchiveEntry(name))) throw new Error("ZIP path traversalを検出しました");
  const tweets = entries.filter(isTweetArchiveEntry);
  contents = tweets.map((name) =>
    execFileSync("unzip", ["-p", resolved, name], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 })
  );
} else {
  throw new Error("ZIPまたは展開済みフォルダを指定してください");
}
if (!contents.length) throw new Error("data/tweets.js が見つかりません。DM等は取り込みません");
const posts = mergeOwnedPosts(contents.flatMap((content) => parseXArchiveTweetsJs(content, accountId)));
console.log(JSON.stringify({ mode: write ? "write" : "preview", posts: posts.length, sample: posts.slice(0, 3).map((p) => ({ postedAt: p.postedAt, text: p.text.slice(0, 80) })) }, null, 2));
if (write) {
  const vaultRoot = process.env.VAULT_ROOT;
  if (!vaultRoot) throw new Error("VAULT_ROOTが未設定です");
  const output = path.join(vaultRoot, "memory/personal/note/x-free-workspace.md");
  let current: XWorkspaceData = { ownedPosts: [], referenceNotes: [] };
  if (existsSync(output)) {
    const match = readFileSync(output, "utf8").match(/```json\s*\n([\s\S]*?)\n```/);
    if (match) current = JSON.parse(match[1]) as XWorkspaceData;
  }
  const next = { ...current, ownedPosts: mergeOwnedPosts([...posts, ...current.ownedPosts]) };
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `# X無料ワークスペース\n\nX APIを使わない本人投稿履歴です。\n\n\`\`\`json\n${JSON.stringify(next, null, 2)}\n\`\`\`\n`, "utf8");
  console.log(`保存しました: ${output}`);
}
