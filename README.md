# Schematic

**Turn DBML text into a clean, domain-grouped ERD — right in your browser.**

Schematic is a free, open-source ERD editor. You write your database schema as
plain [DBML](https://dbml.dbdiagram.io/home/) text, and it renders an
interactive, auto-laid-out entity–relationship diagram you can pan, focus,
rearrange, and export to SVG / PNG / PDF.

It runs 100% in the browser — no account, no backend, nothing leaves your machine.

---

## Why this exists

Drawing ERDs by hand in draw.io (or similar tools) is slow and painful, the
result is hard to keep in sync, and the diagram can't easily be fed back into an
AI as context. Most polished ERD tools are paid.

Schematic takes the opposite approach:

- **Text-first.** Your schema *is* DBML — version it in git, diff it, paste it
  into an AI as context, or generate it from an AI. The diagram is just a view.
- **Domain-aware.** Group tables into domains (e.g. *Content*, *Billing*,
  *Auth*) so a big schema stays readable. Toggle domains on/off, or export one
  A4 page per domain.
- **Built for reading an unfamiliar schema.** Filter tables by how many foreign
  keys point at them, tell master data from transactions at a glance, surface
  the tables an ERD is structurally blind to, and keep track of what you've
  already reviewed.
- **Free & self-hostable.** MIT-licensed. Deploy your own copy in minutes.

---

## Quick start

```bash
npm install
npm run dev      # start the dev server (hot reload)
npm run build    # production build → dist/
npm run preview  # preview the production build locally
npm run typecheck# type-check without emitting
```

Open the dev URL printed in the terminal, and start pasting DBML in the left pane.

---

## Writing DBML

Schematic understands standard DBML. A minimal example:

```dbml
Table users {
  id integer [pk, increment]
  email varchar [unique, not null]
  role user_role
  note: 'App user accounts'
}

Table posts {
  id integer [pk, increment]
  title varchar [not null]
  author_id integer [ref: > users.id]   // inline relationship
}

Enum user_role { admin editor viewer }

Ref: posts.author_id > users.id          // or declare refs separately
```

Supported:

| Feature | Syntax | Shown as |
| --- | --- | --- |
| Primary key | `id integer [pk]` | gold **PK** badge |
| Foreign key | `[ref: > other.id]` or `Ref:` lines | teal **FK** badge + edge |
| Column note | `col type [note: '…']` | dot with tooltip on hover |
| Table note | `note: '…'` inside the table | dot in the header |
| Enums | `Enum name { … }` | listed in the **Enum** panel |
| Relationship kind | `>`, `<`, `-`, `<>` | crow's-foot / single marks |

Nothing needs annotating for the FK filters or role badges — they are derived
from the relationships you already declare.

### Domains (the key feature)

Add a comment line in the form `// [n] TITLE` above a set of tables, and every
table below it (until the next marker) belongs to that domain:

```dbml
// [1] CONTENT
Table posts   { ... }
Table comments{ ... }

// [2] TAXONOMY
Table tags     { ... }
Table post_tags{ ... }
```

Domains get their own color, a labelled box in **By domain** layout, a toggle in
the **Domain ▾** panel, and one A4 page each in the A4 export. Any table not
under a marker is grouped into **Other**.

### Flagging legacy tables

Add table names to `LEGACY_TABLES` in [`src/constants.ts`](src/constants.ts) to
draw them with a dashed red **LEGACY** badge. It's empty by default.

---

## Using the canvas

- **Pan** — drag empty space. **Zoom** — scroll wheel, or the `+ / − / ⤢` HUD.
- **Focus a table** — click it: everything unrelated dims, so you see just its
  relationships. Click the canvas (or the focus chip) to clear.
- **Move a table** — drag it. **Collapse/expand columns** — double-click it.
- **Focus radius** — while a table is focused, the `hop 1 2 3` buttons widen the
  neighbourhood to 2 or 3 relationship steps, so you can follow a whole flow.
- **Search** — matches table names, **column names**, and note text. Enter jumps
  to a match; press Enter again to cycle. Matching columns are highlighted in
  every table at once.
- **Layout** — *By domain* (clustered boxes) or *Flat*. **Density** slider
  controls spacing. Tables (and whole domains) with no edges are packed into a
  grid instead of being strung out into a column.
- **Hubs** — fade edges of highly-connected tables to cut clutter.
- **Keys** — hide non-key columns for a high-level view.
- **Arrange** — re-run auto-layout.
- **Sessions are saved automatically** — positions, filters, collapsed tables
  and audit marks are stored in `localStorage`, keyed to the schema text, along
  with the schema itself. Reload the page and you pick up where you left off.
  `⭳ session` / `⭱ session` export and import the same snapshot as JSON, for
  moving a session between machines.

## Reading a schema you didn't write — **Filter ▾**

An ERD only draws what the schema *declares*. That leaves two blind spots this
panel is built to remove.

**1. Which tables are master data, and which are transactions?**

Every table gets two degree counts and a role badge in its header:

| | Meaning |
| --- | --- |
| **FK out** | FK columns the table owns — higher means more transactional |
| **FK in** | distinct tables pointing at it — higher means more master |
| **MASTER** | pointed at more than it points |
| **TRX** | points at other tables — moving data |
| **PIVOT** | many-to-many join table |
| **ORPHAN** | no foreign key at all, in either direction |

Two range sliders filter on those counts, and the role checkboxes filter on the
classification. Four presets cover the common cuts:

- **master** — referenced at least once, references nobody: pure lookups.
- **unreferenced** — nothing in the schema points here.
- **config** — unreferenced *and* barely referencing: settings, parameters, and
  lookup tables that only application code reads.
- **transactional** — owns at least one foreign key.

This is also the quickest way to hide the noise in a big schema: framework
tables like `activity_log`, `media`, or `personal_access_tokens` are ORPHANs, so
one checkbox removes them.

**2. Tables that are load-bearing but have no lines.**

A table referenced through a plain `varchar` — `cultivations.seed_class` reading
`seed_classes.code` rather than a foreign key — is invisible on any ERD, however
many places depend on it. **Show inferred edges** guesses those relationships
from naming convention (`seed_class` → `seed_classes`, `company_branch_id` →
`company_branches`) and draws them as purple dashed lines, kept visually
separate from real foreign keys because they *are* guesses. The list below the
toggle groups them by target table — "who reads this?" — and every guess can be
rejected individually or per target.

## Auditing a schema over several sittings

**Right-click a table** to cycle its audit mark: ✓ done → ⚠ needs checking →
— ignore → unmarked. Marked tables get a coloured stripe; done and ignored ones
fade back. The status bar counts your progress (`✓ 41/154`), **Hide tables
marked done** clears them off the canvas, and the marks survive both a page
reload and an edit to the schema text.

## Exporting

- **SVG / PNG / PDF** — the current view, one image.
- **A4 ▾** — a multi-page PDF, one (or several tiled) A4 page per domain, with
  headers and page numbers. Choose orientation, *fit to 1 page* vs *readable
  (tiled)*, and a readability scale.

---

## Deploy to Vercel

This is a static Vite app, so deployment is zero-config:

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel, **Add New → Project** and import the repo.
3. Vercel auto-detects Vite (build `npm run build`, output `dist/`). The included
   [`vercel.json`](vercel.json) sets this explicitly. Click **Deploy**.

Or from the CLI:

```bash
npm i -g vercel
vercel        # preview deploy
vercel --prod # production deploy
```

Any other static host (Netlify, GitHub Pages, Cloudflare Pages, S3) works too —
just serve the `dist/` folder.

---

## Project structure

```
index.html            # app shell (markup only)
src/
  main.ts             # boot + event wiring
  update.ts           # parse editor → redraw pipeline
  parser.ts           # DBML → data model
  metrics.ts          # FK degrees, role classification, soft-FK inference
  types.ts            # shared TypeScript types
  constants.ts        # sample schema, colors, dimensions, legacy tables
  state.ts            # central mutable app state + filtering + helpers
  geometry.ts         # text measurement, table sizing, SVG primitives, edges
  layout.ts           # dagre auto-layout (flat + clustered) + grid fallback
  render.ts           # SVG drawing, dragging, focus, audit marks
  view.ts             # pan / zoom / fit
  panels.ts           # domain / filter / enum panels, search, status
  export.ts           # SVG / PNG / PDF / A4 export
  io.ts               # file open, drag-drop, session import/export
  persist.ts          # session snapshot + localStorage autosave
  style.css           # Tailwind entry: theme + UI component classes
  diagram.css         # SVG diagram styling (inlined into exports)
```

Built with [Vite](https://vitejs.dev),
[Tailwind CSS v4](https://tailwindcss.com) for the app chrome,
[dagre](https://github.com/dagrejs/dagre) for graph layout, and
[jsPDF](https://github.com/parallax/jsPDF) for PDF export. No UI framework — the
diagram is direct, imperative SVG.

`diagram.css` is deliberately separate from `style.css`: `export.ts` inlines it
verbatim into exported SVG/PNG/PDF so they render standalone, and shipping the
whole Tailwind bundle inside every export would bloat it with rules the SVG
can't use.

---

## Contributing

Issues and PRs welcome. Before opening a PR, please run `npm run typecheck` and
`npm run build`.

## License

[MIT](LICENSE) — do what you like, no warranty. Update the copyright line in
`LICENSE` to your name/org if you fork it.
