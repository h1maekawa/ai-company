import { NextRequest, NextResponse } from 'next/server';

const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || '';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const API_BASE = 'https://api.github.com/repos';

function getGitHubPath(path: string): string {
  const segments = path.split('/').filter(s => s);
  return segments.map(encodeURIComponent).join('/');
}

async function getFileFromGitHub(path: string): Promise<{ content: string; sha: string }> {
  const githubPath = getGitHubPath(path);
  const url = `${API_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${GITHUB_BRANCH}`;

  console.log('[DEBUG] GET request to:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Vault-API',
    },
  });

  console.log('[DEBUG] Response status:', response.status);

  if (response.status === 404) {
    throw new Error('File not found');
  }

  if (!response.ok) {
    const errorData = await response.text();
    console.log('[DEBUG] Error response:', errorData);
    try {
      const data = JSON.parse(errorData) as Record<string, unknown>;
      throw new Error((data.message as string) || `GitHub API error: ${response.status}`);
    } catch {
      throw new Error(`GitHub API error: ${response.status}`);
    }
  }

  const data = (await response.json()) as { content?: string; sha?: string };

  if (!data.content || !data.sha) {
    console.log('[DEBUG] Invalid response:', { hasContent: !!data.content, hasSha: !!data.sha });
    throw new Error('Invalid GitHub API response');
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, sha: data.sha };
}

async function createOrUpdateFileInGitHub(
  path: string,
  content: string,
  sha?: string
): Promise<{ sha: string }> {
  const githubPath = getGitHubPath(path);
  const url = `${API_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`;

  const encodedContent = Buffer.from(content).toString('base64');

  const body: Record<string, unknown> = {
    message: sha ? `Update ${path}` : `Create ${path}`,
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
    const errorData = await response.text();
    try {
      const data = JSON.parse(errorData) as Record<string, unknown>;
      throw new Error((data.message as string) || `GitHub API error: ${response.status}`);
    } catch {
      throw new Error(`GitHub API error: ${response.status}`);
    }
  }

  const data = (await response.json()) as { commit?: { sha?: string }; content?: { sha?: string } };
  const newSha = data.content?.sha || data.commit?.sha;

  if (!newSha) {
    throw new Error('Invalid GitHub API response: no SHA returned');
  }

  return { sha: newSha };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  try {
    const filePath = params.path.join('/');

    if (!filePath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
      return NextResponse.json({ error: 'Missing required environment variables' }, { status: 500 });
    }

    const { content, sha } = await getFileFromGitHub(filePath);
    return NextResponse.json({ content, sha });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'File not found') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    console.error('Error in GET /api/vault:', message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  try {
    const filePath = params.path.join('/');

    if (!filePath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
      return NextResponse.json({ error: 'Missing required environment variables' }, { status: 500 });
    }

    const body = (await request.json()) as { content: string; sha?: string };

    if (!body.content) {
      return NextResponse.json({ error: 'Content is required in request body' }, { status: 400 });
    }

    const { sha } = await createOrUpdateFileInGitHub(filePath, body.content, body.sha);
    return NextResponse.json({ success: true, sha }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in PUT /api/vault:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
