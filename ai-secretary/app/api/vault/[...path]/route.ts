import { NextRequest, NextResponse } from 'next/server';
import { getVaultFile, saveVaultFile } from '@/app/lib/vault';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
): Promise<NextResponse> {
  try {
    const filePath = params.path.join('/');

    if (!filePath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const { content, sha } = await getVaultFile(filePath);
    
    // Check if the file is completely missing/empty in both GitHub and local FS
    if (!content && !sha) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({ content, sha });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
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

    const body = (await request.json()) as { content: string; sha?: string };

    if (!body.content) {
      return NextResponse.json({ error: 'Content is required in request body' }, { status: 400 });
    }

    const { sha } = await saveVaultFile(filePath, body.content, body.sha);
    return NextResponse.json({ success: true, sha }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in PUT /api/vault:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

