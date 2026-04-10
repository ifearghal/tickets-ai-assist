'use client';

import { useState, useEffect } from 'react';
import TicketModal from './TicketModal';

interface Ticket {
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

interface TicketData {
  open: Ticket[];
  recentClosed: Ticket[];
  countsByCategory: Record<string, { open: number; closed: number }>;
  totals: { open: number; closed: number };
}

interface TicketNode {
  ticket: Ticket;
  children: TicketNode[];
  depth: number;
}

// Category color mapping — earthy/techy palette matching the shire theme
const categoryColors: Record<string, { bg: string; text: string; badge: string }> = {
  Hardware:       { bg: 'border-orange-700/40',  text: 'text-orange-300',  badge: 'bg-orange-900/50 text-orange-300' },
  Infrastructure: { bg: 'border-cyan-700/40',    text: 'text-cyan-300',    badge: 'bg-cyan-900/50 text-cyan-300' },
  Software:       { bg: 'border-violet-700/40',  text: 'text-violet-300',  badge: 'bg-violet-900/50 text-violet-300' },
  Networking:     { bg: 'border-blue-700/40',    text: 'text-blue-300',    badge: 'bg-blue-900/50 text-blue-300' },
  Gaming:         { bg: 'border-purple-700/40',  text: 'text-purple-300',  badge: 'bg-purple-900/50 text-purple-300' },
  Appliances:     { bg: 'border-amber-700/40',   text: 'text-amber-300',   badge: 'bg-amber-900/50 text-amber-300' },
  Product:        { bg: 'border-emerald-700/40',  text: 'text-emerald-300',  badge: 'bg-emerald-900/50 text-emerald-300' },
  ShireWorks:     { bg: 'border-lime-700/40',    text: 'text-lime-300',      badge: 'bg-lime-900/50 text-lime-300' },
  Community:      { bg: 'border-rose-700/40',    text: 'text-rose-300',      badge: 'bg-rose-900/50 text-rose-300' },
  Personal:       { bg: 'border-teal-700/40',    text: 'text-teal-300',      badge: 'bg-teal-900/50 text-teal-300' },
  FearOS:         { bg: 'border-fuchsia-700/40', text: 'text-fuchsia-300',   badge: 'bg-fuchsia-900/50 text-fuchsia-300' },
  Project:        { bg: 'border-indigo-700/40',  text: 'text-indigo-300',    badge: 'bg-indigo-900/50 text-indigo-300' },
  Other:          { bg: 'border-sky-700/40',    text: 'text-sky-300',       badge: 'bg-sky-900/50 text-sky-300' },
};

const defaultColors = { bg: 'border-stone-600/40', text: 'text-stone-300', badge: 'bg-stone-800/50 text-stone-300' };

const priorityColors: Record<string, string> = {
  high:   'text-red-400',
  medium: 'text-yellow-400',
  low:    'text-slate-400',
};

const priorityIcons: Record<string, string> = {
  high:   '🔴',
  medium: '🟡',
  low:    '⚪',
};

function formatDate(d?: string) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
}

function buildHierarchy(flat: Ticket[]): TicketNode[] {
  const map = new Map<string, TicketNode>();
  const roots: TicketNode[] = [];

  for (const t of flat) {
    map.set(t.id, { ticket: t, children: [], depth: 0 });
  }

  for (const node of map.values()) {
    const p = node.ticket.parent;
    if (p && map.has(p)) {
      const parent = map.get(p)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortFn = (a: TicketNode, b: TicketNode) =>
    (b.ticket.type === 'epic' ? 1 : 0) - (a.ticket.type === 'epic' ? 1 : 0) ||
    (b.ticket.date_opened || '').localeCompare(a.ticket.date_opened || '');
  roots.sort(sortFn);
  for (const node of map.values()) {
    node.children.sort(sortFn);
  }

  return roots;
}

export default function TicketPanel() {
  const [data, setData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<{ id: string; title: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchTickets() {
      try {
        const res = await fetch('/api/tickets');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Failed to fetch tickets:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchTickets();
  }, []);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function isCollapsed(id: string) {
    return collapsed.has(id);
  }

  if (loading) {
    return (
      <div className="bg-stone-950 border-2 border-stone-800/40 rounded-lg shadow-lg p-6">
        <p className="text-stone-400/60 text-center">Loading tickets…</p>
      </div>
    );
  }

  const openTickets = data?.open || [];
  const recentClosed = data?.recentClosed || [];
  const totals = data?.totals || { open: 0, closed: 0 };
  const countsByCategory = data?.countsByCategory || {};
  const hierarchy = buildHierarchy(openTickets);

  function getCategoryColors(cat: string) {
    return categoryColors[cat] || defaultColors;
  }

  function renderTicketNode(node: TicketNode): React.ReactNode {
    const t = node.ticket;
    const colors = getCategoryColors(t.category);
    const isEpic = t.type === 'epic';
    const hasChildren = node.children.length > 0;
    const collapsedChildren = isCollapsed(t.id);
    const indentClass = node.depth === 0 ? '' : node.depth === 1 ? 'pl-6' : 'pl-12';

    return (
      <div key={t.id}>
        <div
          className={`p-4 border-l-4 ${colors.bg.replace('border-', 'border-l-').replace('/40', '')} hover:bg-stone-900/30 transition-colors ${indentClass}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {/* Disclosure triangle — only for nodes with children */}
                {hasChildren ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCollapsed(t.id); }}
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-stone-400 hover:text-stone-200 transition-colors"
                    title={collapsedChildren ? 'Expand' : 'Collapse'}
                  >
                    {collapsedChildren ? '▶' : '▼'}
                  </button>
                ) : (
                  <span className="flex-shrink-0 w-4" />
                )}
                <span className="text-xs font-mono text-stone-500">{t.id}</span>
                {isEpic && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-900/40 text-amber-300 border border-amber-700/30">
                    EPIC
                  </span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors.badge}`}>
                  {t.category}
                </span>
                {t.priority && (
                  <span className={`text-xs ${priorityColors[t.priority]}`}>
                    {priorityIcons[t.priority]} {t.priority}
                  </span>
                )}
              </div>
              {/* Title row — clickable, opens modal */}
              <button
                onClick={() => setSelectedTicket({ id: t.id, title: t.title })}
                className="w-full text-left cursor-pointer"
              >
                <p className={`text-sm font-medium leading-snug ${isEpic ? 'text-amber-200' : 'text-stone-100'}`}>
                  {isEpic ? '📌 ' : ''}{t.title}
                  {hasChildren && collapsedChildren && (
                    <span className="ml-2 text-xs text-stone-500 font-normal">
                      ({node.children.length})
                    </span>
                  )}
                </p>
              </button>
              {t.system && (
                <p className="text-xs text-stone-500 mt-1">📦 {t.system}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              {t.date_opened && (
                <span className="text-xs text-stone-500">{formatDate(t.date_opened)}</span>
              )}
              <div className="mt-1">
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-400 border border-yellow-700/30">
                  OPEN
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* Children — only shown when not collapsed */}
        {!collapsedChildren && node.children.length > 0 && (
          <div className="divide-y divide-stone-800/20">
            {node.children.map((child) => renderTicketNode(child))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
    <TicketModal
      isOpen={selectedTicket !== null}
      onClose={() => setSelectedTicket(null)}
      ticketId={selectedTicket?.id ?? null}
      ticketTitle={selectedTicket?.title}
    />
    <div className="bg-stone-950 border-2 border-amber-700/40 rounded-lg shadow-lg">
      {/* Header */}
      <div className="p-4 border-b border-stone-800/30 flex items-center justify-between">
        <h3 className="font-shire font-bold text-lg text-amber-400">
          🎫 TICKET TRACKER
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-300/70">
            <span className="text-emerald-400 font-semibold">{totals.open}</span> open
            {' · '}
            <span className="text-stone-400/70">{totals.closed}</span> closed
          </span>
        </div>
      </div>

      {/* Category summary bar */}
      {Object.keys(countsByCategory).length > 0 && (
        <div className="px-4 py-3 border-b border-stone-800/30 flex flex-wrap gap-2">
          {Object.entries(countsByCategory).map(([cat, counts]) => {
            const colors = getCategoryColors(cat);
            return (
              <span key={cat} className={`text-xs px-2 py-1 rounded font-medium ${colors.badge}`}>
                {cat}: {counts.open} open{counts.closed > 0 ? ` / ${counts.closed} closed` : ''}
              </span>
            );
          })}
        </div>
      )}

      {/* Open tickets — hierarchical */}
      <div className="divide-y divide-stone-800/20">
        {hierarchy.length === 0 ? (
          <div className="p-6 text-center text-stone-500 text-sm">
            <span className="text-2xl block mb-2">✅</span>
            No open tickets — all clear!
          </div>
        ) : (
          hierarchy.map((node) => renderTicketNode(node))
        )}
      </div>

      {/* Recently closed section */}
      {recentClosed.length > 0 && (
        <>
          <div className="border-t border-stone-800/30">
            <button
              onClick={() => setShowClosed(!showClosed)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-900/30 transition-colors text-sm"
            >
              <span className="text-stone-400 font-medium flex items-center gap-2">
                <span>{showClosed ? '▼' : '▶'}</span>
                Recently Resolved
              </span>
              <span className="text-xs text-stone-500 bg-stone-800/50 px-2 py-0.5 rounded">
                {recentClosed.length} tickets
              </span>
            </button>

            {showClosed && (
              <div className="divide-y divide-stone-800/20">
                {recentClosed.map((ticket) => {
                  const colors = getCategoryColors(ticket.category);
                  return (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedTicket({ id: ticket.id, title: ticket.title })}
                      className="px-4 py-3 opacity-60 hover:opacity-80 transition-opacity flex items-start justify-between gap-2 cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-stone-600">{ticket.id}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors.badge}`}>
                            {ticket.category}
                          </span>
                        </div>
                        <p className="text-sm text-stone-300 line-through leading-snug">{ticket.title}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {ticket.date_closed && (
                          <span className="text-xs text-stone-600">{formatDate(ticket.date_closed)}</span>
                        )}
                        <div className="mt-1">
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/20 text-emerald-600 border border-emerald-800/20">
                            ✓ CLOSED
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
    </>
  );
}
