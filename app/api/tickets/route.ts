import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export interface Ticket {
  id: string;
  status: 'open' | 'closed';
  category: string;
  title: string;
  system?: string;
  tags?: string[];
  date_opened?: string;
  date_closed?: string;
  priority?: 'high' | 'medium' | 'low';
  filename: string;
  parent?: string;
  type?: string;
}

const TICKETS_BASE = process.env.TICKETS_BASE || './data/tickets';

async function readTickets(dir: string, status: 'open' | 'closed'): Promise<Ticket[]> {
  const tickets: Ticket[] = [];
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = await fs.readFile(path.join(dir, file), 'utf8');
        const { data } = matter(content);
        tickets.push({
          id: data.id || file.replace('.md', ''),
          status,
          category: data.category || 'Other',
          title: data.title || file,
          system: data.system,
          tags: Array.isArray(data.tags) ? data.tags : [],
          date_opened: data.date_opened
            ? (data.date_opened instanceof Date
                ? data.date_opened.toISOString().split('T')[0]
                : String(data.date_opened))
            : undefined,
          date_closed: data.date_closed
            ? (data.date_closed instanceof Date
                ? data.date_closed.toISOString().split('T')[0]
                : String(data.date_closed))
            : undefined,
          priority: data.priority || undefined,
          parent: data.parent || undefined,
          type: data.type || undefined,
          filename: file,
        });
      } catch {
        // skip unparseable files
      }
    }
  } catch {
    // directory might not exist yet
  }
  return tickets;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since');

    const [openTickets, closedTickets] = await Promise.all([
      readTickets(path.join(TICKETS_BASE, 'open'), 'open'),
      readTickets(path.join(TICKETS_BASE, 'closed'), 'closed'),
    ]);

    openTickets.sort((a, b) =>
      (b.date_opened || '').localeCompare(a.date_opened || '')
    );

    closedTickets.sort((a, b) =>
      (b.date_closed || b.date_opened || '').localeCompare(a.date_closed || a.date_opened || '')
    );
    const recentClosed = closedTickets.slice(0, 10);

    let newlyClosed = closedTickets;
    if (since) {
      newlyClosed = closedTickets.filter(t => {
        const d = t.date_closed || t.date_opened || '';
        return d >= since;
      });
    }

    const allTickets = [...openTickets, ...closedTickets];
    const countsByCategory: Record<string, { open: number; closed: number }> = {};
    for (const t of allTickets) {
      const cat = t.category || 'Other';
      if (!countsByCategory[cat]) countsByCategory[cat] = { open: 0, closed: 0 };
      countsByCategory[cat][t.status]++;
    }

    return NextResponse.json({
      open: openTickets,
      recentClosed,
      countsByCategory,
      totals: {
        open: openTickets.length,
        closed: closedTickets.length,
      },
      newlyClosed: since ? newlyClosed : undefined,
    });
  } catch (error) {
    console.error('Failed to load tickets:', error);
    return NextResponse.json(
      { error: 'Failed to load tickets' },
      { status: 500 }
    );
  }
}

// POST /api/tickets - allocate a new ticket ID using UUID (eliminates race condition)
export async function POST() {
  try {
    const newId = randomUUID();
    return NextResponse.json({ id: newId });
  } catch (error) {
    console.error('Failed to allocate ticket ID:', error);
    return NextResponse.json(
      { error: 'Failed to allocate ticket ID' },
      { status: 500 }
    );
  }
}
