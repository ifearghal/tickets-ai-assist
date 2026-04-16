# Agent Guide — tickets-ai-assist

You are an AI assistant helping a user manage a self-hosted ticket tracking system. This guide tells you everything you need to create, read, update, and organize tickets on their behalf.

---

## What This Is

tickets-ai-assist is a file-based ticket tracker. Tickets are Markdown (`.md`) files stored on the filesystem, with YAML frontmatter for structured metadata. The user describes what they need in plain language — you create the structure.

**Data location:** `data/tickets/open/` and `data/tickets/closed/`

---

## Ticket File Format

Each ticket is a `.md` file. The filename must match the pattern `{id}-{slug}.md` — for example `T-0097-my-new-ticket.md`.

**Every ticket must have frontmatter like this:**

```yaml
---
id: T-0097
status: open
category: Infrastructure
title: My new ticket
tags: [tag1, tag2]
date_opened: 2026-04-10
type: task
---

Body text goes here. Describe the issue, request, or context.
Anything after the closing `---` is the ticket body.
```

### Required Fields

| Field | Notes |
|---|---|
| `id` | Unique ticket ID. Format: `T-NNNN` for tasks, `BUG-NNNN` for bugs, `EPIC-NNNN` for epics. No spaces. |
| `status` | `open` or `closed` |
| `title` | Human-readable title |

### Optional Fields

| Field | Valid values |
|---|---|
| `category` | `Infrastructure`, `Software`, `Hardware`, `Networking`, `Gaming`, `Community`, `Product`, `Project`, `Docs`, `Appliances`, `Personal`, `Other` |
| `type` | `bug`, `task`, `epic` |
| `priority` | `high`, `medium`, `low` |
| `tags` | Array of strings, e.g. `[networking, urgent]` |
| `parent` | ID of parent ticket (for child tickets / epics) |
| `system` | Free text — what system or context this belongs to |
| `date_opened` | ISO date string, e.g. `2026-04-10` |
| `date_closed` | ISO date string, or `~` if not closed |
| `last_updated` | ISO date string, auto-updated on edits |
| `closed_reason` | `resolved`, `wont-fix`, `duplicate` — only when `status: closed` |

---

## Creating a Ticket

**When the user asks you to create a ticket:**

1. Determine the next available ID. Check the highest existing ID in the `open/` directory and increment.
2. Write the file to `data/tickets/open/{id}-{slug}.md`
3. Include all relevant frontmatter fields
4. Add a clear, informative body describing what needs to happen
5. Confirm the ticket was written correctly by reading it back

**Example — User says:** *"can we add a feature to export tickets to CSV?"*

You create `T-0098-my-ticket.md`:
```yaml
---
id: T-0098
status: open
category: Software
title: Export tickets to CSV
tags: [export, tickets, feature-request]
date_opened: 2026-04-10
type: task
---

Add CSV export functionality to the ticket dashboard.
Allow filtering by category, status, and date range.
```

**Example — Epic with child tickets:** User says *"we need a whole new section for sports betting"*

You create the epic first:
```yaml
---
id: EPIC-sports-betting
status: open
category: Product
title: Sports betting integration
tags: [sports-betting, epic]
date_opened: 2026-04-10
type: epic
---

Integrate sports betting odds and markets.
```

Then child tickets with `parent: EPIC-sports-betting`.

---

## Writing Files (Important)

The app server runs as a specific user. When you write tickets directly to the filesystem, make sure:

- Files are owned by a user that the app can read/write
- The `open/` and `closed/` directories exist before writing
- File extension is `.md`
- Filename slug matches the pattern: lowercase, hyphens, no spaces

**File naming rules:**
- `T-0098-my-ticket.md` (task)
- `BUG-0001-critical-bug.md` (bug)
- `EPIC-new-feature.md` (epic)
- Slug: lowercase, hyphens only, no special characters

**Closing a ticket:**
1. Move the file from `open/` to `closed/`
2. Update `status: closed` and add `date_closed: YYYY-MM-DD`

---

## How the Write Proxy Works

The web UI's inline editor doesn't write directly to disk — it sends a `PUT /api/tickets/{id}` request to a write proxy. The proxy runs at `localhost:9187` by default and handles filesystem writes.

**For AI agents:** You don't need the write proxy. You can write files directly via your filesystem tools. Just write to the correct path and update the frontmatter.

**If a `PUT /api/tickets/{id}` request fails with a proxy error:** The proxy may be unreachable or misconfigured. Flag it to the user.

---

## Frontmatter Pitfalls

- **Missing closing `---`:** Gray-matter (the YAML parser) requires the closing `---` after frontmatter. Without it, all fields silently fail to parse.
- **Date formats:** Use `YYYY-MM-DD` strings. Avoid `Date` objects in YAML — they serialize unpredictably.
- **`date_closed: ~`:** Use the literal `~` character when a closed ticket has no close date, not an empty string.
- **ID uniqueness:** Duplicate IDs cause the API to return unpredictable results. Always check for existing IDs first.

---

## Quick Reference

**Creating a task:**
```bash
# File: data/tickets/open/T-NNNN-slug.md
---
id: T-NNNN
status: open
category: Infrastructure
title: Title here
date_opened: YYYY-MM-DD
type: task
---

Describe the ticket...
```

**Creating an epic:**
```bash
# File: data/tickets/open/EPIC-slug.md
---
id: EPIC-slug
status: open
category: Product
title: Epic title
date_opened: YYYY-MM-DD
type: epic
---

Describe the epic scope...
```

**Closing a ticket:**
1. Move file from `open/` to `closed/`
2. Update frontmatter: `status: closed`, `date_closed: YYYY-MM-DD`, `closed_reason: resolved`

---

## File Locations

- **Open tickets:** `data/tickets/open/`
- **Closed tickets:** `data/tickets/closed/`
- **Ticket data base path** (env var): `TICKETS_BASE` (default: `./data/tickets`)

---

## Categories Reference

Use one of these exact values for `category`:

| Category | Use for |
|---|---|
| `Infrastructure` | Servers, networking, DNS, containers |
| `Software` | Code, apps, libraries, tooling |
| `Hardware` | Physical devices, peripherals, upgrades |
| `Networking` | Network config, firewall, VPN |
| `Gaming` | Games, Steam, Proton, gaming setup |
| `Community` | Outreach, advocacy, external relations |
| `Product` | Product features and decisions |
| `Project` | Project management, planning |
| `Docs` | Documentation, READMEs, guides |
| `Appliances` | Smart home, appliances, IoT |
| `Personal` | Personal items, non-work |
| `Other` | Doesn't fit elsewhere |

---

## Workflow — Ticket Changes

**1. File ticket in Mission Control** → not local sandbox tickets
**2. Sandbox dev** → make changes on sandbox at `~/tickets-app-tinker/`
**3. Forgejo** → push to Forgejo (origin/main)
**4. QA** → spawn Merry for review
   - Bug found? → fix on sandbox → push to Forgejo → QA again
   - Repeat until clean
**5. GitHub** → version bump in package.json + update CHANGELOG → push

**Code changes:** Commit and push to Forgejo first. GitHub push only after QA passes.
