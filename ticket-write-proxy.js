#!/usr/bin/env node
/**
 * tickets-write-proxy
 * 
 * A simple HTTP server that handles ticket file writes from the tickets-app web UI.
 * The Next.js API route PUT /api/tickets/{id} forwards writes here to avoid
 * UID/permission issues when writing directly from the container.
 * 
 * Usage:
 *   node proxy.js
 *   PORT=9187 TOKEN=your-secret-token node proxy.js
 * 
 * Environment variables:
 *   PORT          - port to listen on (default: 9187)
 *   TOKEN         - auth token (default: change-me-in-production)
 *   TICKETS_BASE  - path to ticket data directory (default: ./data/tickets)
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');

const PORT = process.env.PORT || 9187;
const TOKEN = process.env.TOKEN || process.env.TICKET_WRITE_PROXY_TOKEN || 'change-me-in-production';
const TICKETS_BASE = process.env.TICKETS_BASE || path.join(process.cwd(), 'data', 'tickets');

function unauthorized(res) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
}

function notFound(res, msg = 'Not found') {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: msg }));
}

function serverError(res, msg = 'Internal error') {
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: msg }));
}

async function findTicketFile(id) {
  for (const status of ['open', 'closed']) {
    const dir = path.join(TICKETS_BASE, status);
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const match = file.startsWith(id + '-') || file === id + '.md';
        if (match) return path.join(dir, file);
        // Also check frontmatter id
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf8');
          const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (yamlMatch) {
            const idField = yamlMatch[1].match(/^id:\s*(.+)$/m);
            if (idField && idField[1].trim() === id) return path.join(dir, file);
          }
        } catch { /* skip */ }
      }
    } catch { /* dir missing */ }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ticket-proxy-token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth check
  const token = req.headers['x-ticket-proxy-token'];
  if (token !== TOKEN) return unauthorized(res);

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const ticketMatch = url.pathname.match(/^\/tickets\/(.+)$/);
  if (!ticketMatch) return notFound(res, 'Unknown endpoint');

  const ticketId = decodeURIComponent(ticketMatch[1]);

  if (req.method === 'PUT') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return serverError(res, 'Invalid JSON');
    }

    const { rawContent } = parsed;
    if (typeof rawContent !== 'string') {
      return serverError(res, 'rawContent must be a string');
    }

    try {
      const filePath = await findTicketFile(ticketId);
      if (!filePath) return notFound(res, 'Ticket not found');

      // Determine current status from the directory the file lives in
      const currentStatus = filePath.includes('/open/') ? 'open' : 'closed';

      // Parse frontmatter from the incoming content to get new status
      let newStatus = currentStatus;
      try {
        const parsedMatter = matter(rawContent);
        if (parsedMatter.data && parsedMatter.data.status) {
          newStatus = parsedMatter.data.status === 'closed' ? 'closed' : 'open';
        }
      } catch (e) {
        // use currentStatus as fallback
      }

      // If status changed, move the file to the correct directory
      let finalPath = filePath;
      if (newStatus !== currentStatus) {
        const filename = path.basename(filePath);
        const newDir = path.join(TICKETS_BASE, newStatus);
        const newPath = path.join(newDir, filename);
        // Ensure destination directory exists
        await fs.mkdir(newDir, { recursive: true });
        await fs.rename(filePath, newPath);
        finalPath = newPath;
      }

      await fs.writeFile(finalPath, rawContent, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: finalPath, moved: newStatus !== currentStatus }));
    } catch (err) {
      console.error('Write error:', err);
      serverError(res, `Write failed: ${err.message}`);
    }
  } else if (req.method === 'GET') {
    // Health check
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', tickets_base: TICKETS_BASE }));
  } else {
    notFound(res, 'Method not allowed');
  }
});

server.listen(PORT, () => {
  console.log(`tickets-write-proxy listening on port ${PORT}`);
  console.log(`Writing to: ${TICKETS_BASE}`);
});
