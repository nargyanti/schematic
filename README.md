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
- **Search** — type a table name and press Enter to jump + focus it.
- **Layout** — *By domain* (clustered boxes) or *Flat*. **Density** slider
  controls spacing.
- **Dim hubs** — fade edges of highly-connected tables to cut clutter.
- **PK/FK only** — hide non-key columns for a high-level view.
- **Arrange** — re-run auto-layout.
- **Save / load layout** — export your manual positions + view options as JSON
  and reload them later.

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
  types.ts            # shared TypeScript types
  constants.ts        # sample schema, colors, dimensions, legacy tables
  state.ts            # central mutable app state + helpers
  geometry.ts         # text measurement, table sizing, SVG primitives, edges
  layout.ts           # dagre auto-layout (flat + clustered by domain)
  render.ts           # SVG drawing, dragging, focus, highlighting
  view.ts             # pan / zoom / fit
  panels.ts           # domain + enum panels, search, status
  export.ts           # SVG / PNG / PDF / A4 export
  io.ts               # file open, drag-drop, save/load layout
  style.css           # all styling
```

Built with [Vite](https://vitejs.dev), [dagre](https://github.com/dagrejs/dagre)
for graph layout, and [jsPDF](https://github.com/parallax/jsPDF) for PDF export.
No UI framework — the rendering is direct, imperative SVG.

---

## Contributing

Issues and PRs welcome. Before opening a PR, please run `npm run typecheck` and
`npm run build`.

## License

[MIT](LICENSE) — do what you like, no warranty. Update the copyright line in
`LICENSE` to your name/org if you fork it.
