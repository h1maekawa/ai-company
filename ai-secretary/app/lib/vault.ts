import fs from 'fs';
import path from 'path';

const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const API_BASE = 'https://api.github.com/repos';

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
    const url = `${API_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${GITHUB_BRANCH}`;

    console.log(`[DEBUG] Vault-Utility GET request to: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vault-API',
      },
      cache: 'no-store', // Always fetch fresh contents
    });

    if (response.status === 404) {
      return { content: '', sha: undefined };
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as { content?: string; sha?: string };
    if (!data.content || !data.sha) {
      throw new Error('Invalid GitHub API response');
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content, sha: data.sha };
  } else {
    // Local filesystem fallback
    try {
      const localPath = path.resolve(process.cwd(), '..', filePath);
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath, 'utf-8');
        return { content, sha: undefined };
      }
    } catch (e) {
      console.error(`[DEBUG] Local file read failed for ${filePath}:`, e);
    }
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
    const githubPath = getGitHubPath(filePath);
    const url = `${API_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`;

    const encodedContent = Buffer.from(content).toString('base64');
    const body: Record<string, unknown> = {
      message: sha ? `Update ${filePath}` : `Create ${filePath}`,
      content: encodedContent,
      branch: GITHUB_BRANCH,
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Vault-API',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
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
      const localPath = path.resolve(process.cwd(), '..', filePath);
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
