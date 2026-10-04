import fs from 'fs';
import path from 'path';
import { resolveRawPath } from './runtime/paths';
import { probeGithubRepository, type ConnectionFailureCode } from './system/vaultDiagnostics';

const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const API_BASE = 'https://api.github.com/repos';
export class VaultConflictError extends Error {
  readonly status = 409;
  constructor(public readonly filePath: string) { super('VAULT_CONFLICT'); }
}
export class VaultApiError extends Error {
  constructor(public readonly status: number, public readonly filePath: string) { super(`VAULT_API_ERROR_${status}`); }
}
export class VaultRepositoryNotAccessibleError extends Error {
  readonly status: number;
  constructor(public readonly failureCode: ConnectionFailureCode, status: number, public readonly filePath: string) { super(failureCode); this.status = status; }
}
let repositoryProbeCache: { at:number; ok:boolean; status:number; failureCode?:ConnectionFailureCode } | null = null;
async function assertRepositoryAccessible(filePath: string) {
  const cached = repositoryProbeCache && Date.now() - repositoryProbeCache.at < 45_000 ? repositoryProbeCache : null;
  const result = cached ?? { at:Date.now(), ...(await probeGithubRepository({ owner:GITHUB_OWNER, repo:GITHUB_REPO, token:GITHUB_TOKEN, signal:AbortSignal.timeout(8000) })) };
  repositoryProbeCache = result;
  if (!result.ok) throw new VaultRepositoryNotAccessibleError(result.failureCode ?? 'UNKNOWN', result.status, filePath);
}
/** Reapply a pure document edit to the latest version after a competing write. */
const documentUpdates = new Map<string, Promise<unknown>>();
export async function updateVaultFile(filePath: string, transform: (content: string) => string, maxAttempts = 3): Promise<{ sha: string }> {
  const previous = documentUpdates.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => updateVaultDocument(filePath, transform, maxAttempts));
  documentUpdates.set(filePath, next);
  try { return await next; }
  finally { if (documentUpdates.get(filePath) === next) documentUpdates.delete(filePath); }
}
async function updateVaultDocument(filePath: string, transform: (content: string) => string, maxAttempts: number): Promise<{ sha: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await getVaultFile(filePath);
    const updated = transform(current.content);
    if (updated === current.content) return { sha: current.sha ?? 'local-sha' };
    try { return await saveVaultFile(filePath, updated, current.sha); }
    catch (error) { if (!(error instanceof VaultConflictError) || attempt === maxAttempts - 1) throw error; }
  }
  throw new VaultConflictError(filePath);
}
function githubBranch(): string {
  const branch = process.env.GITHUB_BRANCH?.trim();
  const productionBranch = process.env.GITHUB_PRODUCTION_BRANCH?.trim() || 'main';
  const stage = process.env.VERCEL_ENV === 'production' ? 'production' : process.env.VERCEL_ENV === 'preview' ? 'preview' : 'development';
  if (stage === 'production') return branch || productionBranch;
  if (!branch || branch === productionBranch || branch === 'main' || branch === 'master') throw new Error('NON_PRODUCTION_VAULT_BRANCH_REQUIRED');
  return branch;
}

function getGitHubPath(filePath: string): string {
  const segments = filePath.split('/').filter(s => s);
  return segments.map(encodeURIComponent).join('/');
}

export interface VaultFile {
  content: string;
  sha?: string;
}

/**
 * Gets a file content from GitHub Vault (production) or Local Filesystem (development)
 */
export async function getVaultFile(filePath: string): Promise<VaultFile> {
  if (GITHUB_OWNER && GITHUB_REPO && GITHUB_TOKEN) {
    const githubPath = getGitHubPath(filePath);
    const url = `${API_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${encodeURIComponent(githubBranch())}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vault-API',
      },
      cache: 'no-store', // Always fetch fresh contents
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 404) {
      await assertRepositoryAccessible(filePath);
      return { content: '', sha: undefined };
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new VaultApiError(response.status, filePath);
    }

    const data = (await response.json()) as { content?: string; sha?: string; encoding?: string };
    if (data.content === undefined || !data.sha || (data.encoding && data.encoding !== 'base64')) {
      throw new Error('Invalid GitHub API response');
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content, sha: data.sha };
  } else {
    // Local filesystem fallback
    try {
      const localPath = resolveRawPath(filePath);
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath, 'utf-8');
        return { content, sha: undefined };
      }
    } catch (e) { throw e; }
    return { content: '', sha: undefined };
  }
}

/**
 * Saves or updates a file on GitHub Vault (production) or Local Filesystem (development)
 */
export async function saveVaultFile(
  filePath: string,
  content: string,
  sha?: string
): Promise<{ sha: string }> {
  if (GITHUB_OWNER && GITHUB_REPO && GITHUB_TOKEN) {
    // A missing SHA must mean a verified create, even if a caller swallowed its
    // own read error. Never let that ambiguity turn into an unsafe overwrite.
    if (!sha && (await getVaultFile(filePath)).sha) throw new VaultConflictError(filePath);
    const githubPath = getGitHubPath(filePath);
    const url = `${API_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`;

    const encodedContent = Buffer.from(content).toString('base64');
    const body: Record<string, unknown> = {
      message: sha ? `Update ${filePath}` : `Create ${filePath}`,
      content: encodedContent,
      branch: githubBranch(),
    };

    if (sha) {
      body.sha = sha;
    }

    const put = () =>
      fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Vault-API',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });

    const response = await put();
    if (response.status === 409) throw new VaultConflictError(filePath);
    if (response.status === 404) { repositoryProbeCache = null; await assertRepositoryAccessible(filePath); }

    if (!response.ok) {
      throw new VaultApiError(response.status, filePath);
    }

    const data = (await response.json()) as { commit?: { sha?: string }; content?: { sha?: string } };
    const newSha = data.content?.sha || data.commit?.sha;

    if (!newSha) {
      throw new Error('Invalid GitHub API response: no SHA returned');
    }

    return { sha: newSha };
  } else {
    // Local filesystem write
    try {
      const localPath = resolveRawPath(filePath);
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(localPath, content, 'utf-8');
      return { sha: 'local-sha' };
    } catch (e) {
      throw new Error(`Local file write failed: ${(e as Error).message}`);
    }
  }
}

export interface VaultEntry {
  name: string;
  type: 'file' | 'dir';
}

/**
 * Lists entries (files AND subdirectories) in a directory on GitHub Vault (production)
 * or Local Filesystem (development). Used for recursive memory scope scanning so that
 * it works correctly on Vercel (where the local filesystem does not contain the Vault).
 */
export async function listVaultEntries(dirPath: string): Promise<VaultEntry[]> {
  if (GITHUB_OWNER && GITHUB_REPO && GITHUB_TOKEN) {
    const githubPath = getGitHubPath(dirPath);
    const url = `${API_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${encodeURIComponent(githubBranch())}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vault-API',
      },
      cache: 'no-store',
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as Array<{ name: string; type: string }>;
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(item => ({ name: item.name, type: item.type === 'dir' ? 'dir' as const : 'file' as const }));
  } else {
    // Local filesystem fallback
    try {
      const localPath = resolveRawPath(dirPath);
      if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) {
        return fs.readdirSync(localPath).map(name => {
          const full = path.join(localPath, name);
          return { name, type: (fs.statSync(full).isDirectory() ? 'dir' : 'file') as 'dir' | 'file' };
        });
      }
    } catch (e) {
      console.error(`[DEBUG] Local directory entries list failed for ${dirPath}:`, e);
    }
    return [];
  }
}

/**
 * Lists filenames in a directory on GitHub Vault (production) or Local Filesystem (development)
 */
export async function listVaultDirectory(dirPath: string): Promise<string[]> {
  if (GITHUB_OWNER && GITHUB_REPO && GITHUB_TOKEN) {
    const githubPath = getGitHubPath(dirPath);
    const url = `${API_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${encodeURIComponent(githubBranch())}`;

    console.log(`[DEBUG] Vault-Utility LIST request to: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vault-API',
      },
      cache: 'no-store',
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as Array<{ name: string; type: string }>;
    if (!Array.isArray(data)) {
      return [];
    }

    return data.filter(item => item.type === 'file').map(item => item.name);
  } else {
    // Local filesystem fallback
    try {
      const localPath = resolveRawPath(dirPath);
      if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) {
        return fs.readdirSync(localPath).filter(name => {
          const full = path.join(localPath, name);
          return fs.statSync(full).isFile();
        });
      }
    } catch (e) {
      console.error(`[DEBUG] Local directory list failed for ${dirPath}:`, e);
    }
    return [];
  }
}
