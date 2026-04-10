import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';

export const dynamic = 'force-dynamic';

const TICKETS_BASE = '/mnt/clawd-projects/tickets';
// Write proxy runs on sam480, tunneled to production host via SSH
// Container reaches it via host.containers.internal
const WRITE_PROXY_URL = process.env.TICKET_WRITE_PROXY_URL || 'http://169.254.1.2:9187';
const WRITE_PROXY_TOKEN = process.env.TICKET_WRITE_PROXY_TOKEN || 'shireworks-ticket-proxy';

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
        // Also try matching by reading the frontmatter id
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

    // Validate it's still valid markdown with frontmatter
    try {
      matter(rawContent);
    } catch {
      return NextResponse.json({ error: 'Invalid markdown/frontmatter' }, { status: 400 });
    }

    // Forward the write to the proxy running on sam480 (tunneled through SSH)
    const proxyRes = await fetch(`${WRITE_PROXY_URL}/tickets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-ticket-proxy-token': WRITE_PROXY_TOKEN,
      },
      body: JSON.stringify({ rawContent }),
    });

    if (!proxyRes.ok) {
      const err = await proxyRes.json().catch(() => ({}));
      console.error('Write proxy error:', err);
      return NextResponse.json(
        { error: (err as { error?: string }).error || 'Write proxy failed' },
        { status: proxyRes.status }
      );
    }

    const result = await proxyRes.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to save ticket:', error);
    return NextResponse.json({ error: 'Failed to save ticket' }, { status: 500 });
  }
}
