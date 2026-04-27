import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const TICKETS_BASE = process.env.TICKETS_BASE || './data/tickets';
const VALID_STATUSES = new Set(['open', 'closed']);

function hasValidFrontmatter(rawContent: string): boolean {
  return /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(rawContent);
}

async function findTicketFile(id: string): Promise<{ filePath: string; status: 'open' | 'closed' } | null> {
  for (const status of ['open', 'closed'] as const) {
    const dir = path.join(TICKETS_BASE, status);
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        if (file.startsWith(id + '-') || file === id + '.md') {
          return { filePath: path.join(dir, file), status };
        }
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf8');
          const { data } = matter(content);
          if (data.id === id) {
            return { filePath: path.join(dir, file), status };
          }
        } catch {
          // skip
        }
      }
    } catch {
      // directory might not exist
    }
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const found = await findTicketFile(id);
    if (!found) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const raw = await fs.readFile(found.filePath, 'utf8');
    const { data, content } = matter(raw);

    return NextResponse.json({
      id: data.id || id,
      status: data.status || found.status,
      category: data.category || 'Other',
      title: data.title || id,
      system: data.system || null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      date_opened: data.date_opened
        ? (data.date_opened instanceof Date
            ? data.date_opened.toISOString().split('T')[0]
            : String(data.date_opened))
        : null,
      date_closed: data.date_closed && data.date_closed !== '~'
        ? (data.date_closed instanceof Date
            ? data.date_closed.toISOString().split('T')[0]
            : String(data.date_closed))
        : null,
      last_updated: data.last_updated
        ? (data.last_updated instanceof Date
            ? data.last_updated.toISOString().split('T')[0]
            : String(data.last_updated))
        : null,
      priority: data.priority || null,
      body: content.trim(),
      filename: path.basename(found.filePath),
      rawContent: raw,
    });
  } catch (error) {
    console.error('Failed to load ticket:', error);
    return NextResponse.json({ error: 'Failed to load ticket' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { rawContent } = body;

    if (typeof rawContent !== 'string') {
      return NextResponse.json({ error: 'rawContent must be a string' }, { status: 400 });
    }

    if (!hasValidFrontmatter(rawContent)) {
      return NextResponse.json({ error: 'Invalid markdown/frontmatter' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = matter(rawContent);
    } catch {
      return NextResponse.json({ error: 'Invalid markdown/frontmatter' }, { status: 400 });
    }

    if (parsed.data.status !== undefined && !VALID_STATUSES.has(String(parsed.data.status))) {
      return NextResponse.json({ error: 'Invalid status. Expected open or closed.' }, { status: 400 });
    }

    const found = await findTicketFile(id);
    if (!found) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const newStatus = parsed.data.status || found.status;
    const targetDir = path.join(TICKETS_BASE, newStatus === 'closed' ? 'closed' : 'open');
    const filename = path.basename(found.filePath);
    const targetPath = path.join(targetDir, filename);

    // Atomic write: write to temp file first, then rename to avoid TOCTOU
    const tmpPath = path.join(targetDir, `.~tmp.${randomUUID()}`);
    try {
      await fs.writeFile(tmpPath, rawContent, 'utf8');
      await fs.rename(tmpPath, targetPath);
      // Delete the old file if it moved to a different directory
      if (found.filePath !== targetPath) {
        try { await fs.unlink(found.filePath); } catch { /* ignore */ }
      }
    } catch (err) {
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      console.error('Failed to write ticket:', err);
      return NextResponse.json({ error: 'Failed to write ticket' }, { status: 500 });
    }

    return NextResponse.json({ success: true, filename, status: newStatus });
  } catch (error) {
    console.error('Failed to save ticket:', error);
    return NextResponse.json({ error: 'Failed to save ticket' }, { status: 500 });
  }
}
