import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { VAULT_ROOT } from "../../runtime/paths";
import type { LearningEvent } from "./runnerTypes";
export const usesLocalExecutionStorage = () =>
  Boolean(VAULT_ROOT && !process.env.GITHUB_OWNER && !process.env.GITHUB_REPO);
async function directory(parts: string[], create: boolean) {
  const root = await fs.realpath(VAULT_ROOT);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if (create)
      await fs.mkdir(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("UNSAFE_EXECUTION_STORAGE");
  }
  return current;
}
export async function readLocalExecution(): Promise<string> {
  try {
    const parent = await directory(["memory", "personal", "company"], false);
    const file = path.join(parent, "execution.md");
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("UNSAFE_EXECUTION_STORAGE");
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
export async function writeLocalExecution(
  markdown: string,
  events: LearningEvent[],
) {
  const parent = await directory(["memory", "personal", "company"], true);
  const file = path.join(parent, "execution.md");
  const audit = await directory(["memory", "learning"], true);
  // Immutable per-event audit records; retry accepts only exactly identical content.
  for (const event of events) {
    const name = createHash("sha256").update(event.id).digest("hex") + ".json";
    const target = path.join(audit, name);
    const content = JSON.stringify(event);
    try {
      await fs.writeFile(target, content, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await fs.lstat(target);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        (await fs.readFile(target, "utf8")) !== content
      )
        throw new Error("LEARNING_APPEND_ONLY");
    }
  }
  const temporary = path.join(parent, `.execution-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, markdown, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}
