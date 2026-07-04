import { MEMORY_SCOPES, DEFAULT_GLOBAL_SCOPE } from "../config/scopes";
import { getVaultFile, listVaultEntries, VaultEntry } from "../vault";

export type LoadedMemory = {
  files: {
    path: string;
    content: string;
  }[];
};

/**
 * Recursively scans a directory via the Vault abstraction (GitHub on Vercel, local
 * filesystem in dev) and finds all .md files. Must not touch the local filesystem
 * directly, since on Vercel the Vault only exists on GitHub.
 */
async function scanDirectoryRecursive(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  let entries: VaultEntry[];
  try {
    entries = await listVaultEntries(dirPath);
  } catch (e) {
    console.error(`[DEBUG] Failed to scan directory ${dirPath}:`, e);
    return results;
  }

  const cleanDirPath = dirPath.replace(/\/$/, "");

  for (const entry of entries) {
    const itemRelPath = `${cleanDirPath}/${entry.name}`;
    if (entry.type === "dir") {
      const nested = await scanDirectoryRecursive(itemRelPath);
      results.push(...nested);
    } else if (entry.name.endsWith(".md")) {
      results.push(itemRelPath);
    }
  }

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
      // A scope entry ending in "/" is a directory to scan recursively; otherwise it's a single file.
      const isDirectoryScope = rawPath.endsWith("/");
      const cleanPath = rawPath.replace(/\/$/, "");
      if (processedPaths.has(cleanPath)) continue;
      processedPaths.add(cleanPath);

      if (!filterPath(cleanPath)) {
        continue;
      }

      if (isDirectoryScope) {
        const mdFiles = await scanDirectoryRecursive(cleanPath);
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
      } else if (cleanPath.endsWith(".md")) {
        try {
          const { content } = await getVaultFile(cleanPath);
          if (content && content.trim()) {
            loadedFiles.push({ path: cleanPath, content });
          }
        } catch (e) {
          console.error(`Failed to load file ${cleanPath}:`, e);
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
