import fs from "fs";
import path from "path";
import { MEMORY_SCOPES, DEFAULT_GLOBAL_SCOPE } from "../config/scopes";
import { getVaultFile } from "../vault";
import { resolveRawPath } from "../runtime/paths";

export type LoadedMemory = {
  files: {
    path: string;
    content: string;
  }[];
};

/**
 * Recursively scans a directory on the local filesystem and finds all .md files.
 */
function scanDirectoryRecursive(dirPath: string): string[] {
  const absolutePath = resolveRawPath(dirPath);
  const results: string[] = [];

  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) {
    return [];
  }

  const recurse = (currentAbsPath: string, relativePathPrefix: string) => {
    try {
      const items = fs.readdirSync(currentAbsPath, { withFileTypes: true });
      for (const item of items) {
        const itemRelPath = path.join(relativePathPrefix, item.name);
        const itemAbsPath = path.join(currentAbsPath, item.name);

        if (item.isDirectory()) {
          recurse(itemAbsPath, itemRelPath);
        } else if (item.isFile() && item.name.endsWith(".md")) {
          results.push(itemRelPath);
        }
      }
    } catch (e) {
      console.error(`[DEBUG] Failed to scan directory ${currentAbsPath}:`, e);
    }
  };

  recurse(absolutePath, dirPath);
  return results;
}

/**
 * Loads memory files dynamically based on Local, Shared, and Global scopes.
 * Follows the priority: local > shared > global.
 */
export async function loadScopedMemory(
  secretaryId: string,
  activeCompany?: "personal" | "company"
): Promise<LoadedMemory> {
  const scope = MEMORY_SCOPES[secretaryId];
  const loadedFiles: { path: string; content: string }[] = [];
  const processedPaths = new Set<string>();

  const localPaths = scope ? scope.local : [];
  const sharedPaths = scope ? scope.shared : [];
  const globalPaths = scope ? (scope.global.length > 0 ? scope.global : DEFAULT_GLOBAL_SCOPE) : DEFAULT_GLOBAL_SCOPE;

  const allScopeGroups = [
    { type: "local", paths: localPaths },
    { type: "shared", paths: sharedPaths },
    { type: "global", paths: globalPaths }
  ];

  const filterPath = (rawPath: string): boolean => {
    if (!activeCompany) return true;
    const clean = rawPath.replace(/^memory\//, "").replace(/^vault\//, "");
    if (activeCompany === "personal") {
      if (clean.startsWith("company/") || clean.startsWith("crestix/")) {
        return false;
      }
    } else if (activeCompany === "company") {
      if (clean.startsWith("personal/")) {
        return false;
      }
    }
    return true;
  };

  for (const group of allScopeGroups) {
    for (const rawPath of group.paths) {
      // Normalize path (remove trailing slash for fs checks)
      const cleanPath = rawPath.replace(/\/$/, "");
      if (processedPaths.has(cleanPath)) continue;
      processedPaths.add(cleanPath);

      if (!filterPath(cleanPath)) {
        continue;
      }

      const absolutePath = resolveRawPath(cleanPath);
      if (!fs.existsSync(absolutePath)) {
        continue;
      }

      const stat = fs.statSync(absolutePath);
      if (stat.isFile()) {
        if (cleanPath.endsWith(".md")) {
          try {
            const { content } = await getVaultFile(cleanPath);
            if (content && content.trim()) {
              loadedFiles.push({ path: cleanPath, content });
            }
          } catch (e) {
            console.error(`Failed to load file ${cleanPath}:`, e);
          }
        }
      } else if (stat.isDirectory()) {
        const mdFiles = scanDirectoryRecursive(cleanPath);
        for (const mdFile of mdFiles) {
          if (!filterPath(mdFile)) {
            continue;
          }
          try {
            const { content } = await getVaultFile(mdFile);
            if (content && content.trim()) {
              loadedFiles.push({ path: mdFile, content });
            }
          } catch (e) {
            console.error(`Failed to load directory file ${mdFile}:`, e);
          }
        }
      }
    }
  }


  return { files: loadedFiles };
}

export async function loadMemoryFromVault(mode: string): Promise<string> {
  let secretaryId = "executive-assistant";
  if (mode === "personal") secretaryId = "personal-note";
  else if (mode === "company") secretaryId = "crestix-system";
  else if (mode === "finance") secretaryId = "personal-finance";
  else if (mode === "note") secretaryId = "personal-note";

  const { files } = await loadScopedMemory(secretaryId);
  return files.map(f => `=== ${f.path.split("/").pop()} ===\n${f.content.trim()}`).join("\n\n");
}
