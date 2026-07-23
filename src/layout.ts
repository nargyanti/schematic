import { graphlib, layout as dagreLayout } from "@dagrejs/dagre";
import { sizeTable } from "./geometry";
import { state, tableGroup, visRefs, visTables } from "./state";
import type { GroupBox, Point, Ref, Spacing, Table } from "./types";
import { fitView } from "./view";

export function spacingVals(): Spacing {
  const v = +(document.getElementById("spacing") as HTMLInputElement).value;
  return { node: 22 + v * 0.5, rank: 60 + v * 1.5, group: 50 + v * 1.7 };
}

interface LayoutResult {
  pos: Record<string, Point>;
  groupBoxAbs: Record<string, GroupBox>;
}

interface Boxed {
  key: string;
  w: number;
  h: number;
}

/**
 * Arrange boxes with no edges between them into a grid.
 *
 * Dagre gives every unconnected node its own rank, so a filtered view like
 * "config tables only" — or any set of domains with no cross-domain links —
 * collapses into one column tens of screens tall. A grid is both readable and
 * honest: there is no structure here to draw. Used for tables and for whole
 * domain boxes, which hit the same degenerate case one level up.
 */
function packGrid(items: Boxed[], gap: number, originX: number, originY: number, pos: Record<string, Point>): { w: number; h: number } {
  if (!items.length) return { w: 0, h: 0 };
  const colW = Math.max(...items.map((b) => b.w)) + gap;
  // Aim for a landscape block rather than a strip in either direction.
  const cols = Math.max(1, Math.round(Math.sqrt(items.length * 1.9)));
  let x = originX,
    y = originY,
    rowH = 0,
    maxW = 0;
  items.forEach((b, i) => {
    if (i > 0 && i % cols === 0) {
      x = originX;
      y += rowH + gap * 0.8;
      rowH = 0;
    }
    pos[b.key] = { x, y };
    rowH = Math.max(rowH, b.h);
    x += colW;
    maxW = Math.max(maxW, x - originX);
  });
  return { w: maxW - gap, h: y + rowH - originY };
}

const boxOfTable = (t: Table): Boxed => ({ key: t.name, w: t.width!, h: t.height! });

export function layoutFlat(tables: Table[], refs: Ref[], sp: Spacing): LayoutResult {
  const ns = new Set(tables.map((t) => t.name));
  tables.forEach(sizeTable);

  const touched = new Set<string>();
  refs.forEach((r) => {
    if (ns.has(r.from.table) && ns.has(r.to.table)) {
      touched.add(r.from.table);
      touched.add(r.to.table);
    }
  });
  const linked = tables.filter((t) => touched.has(t.name));
  const loose = tables.filter((t) => !touched.has(t.name));

  const p: Record<string, Point> = {};
  let bottom = 20;
  if (linked.length) {
    const g = new graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: sp.node, ranksep: sp.rank, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    linked.forEach((t) => g.setNode(t.name, { width: t.width!, height: t.height! }));
    refs.forEach((r) => {
      if (touched.has(r.from.table) && touched.has(r.to.table)) g.setEdge(r.from.table, r.to.table);
    });
    try {
      dagreLayout(g);
    } catch (e) {
      /* dagre can throw on degenerate graphs */
    }
    linked.forEach((t) => {
      const n = g.node(t.name);
      p[t.name] = n ? { x: n.x - t.width! / 2, y: n.y - t.height! / 2 } : { x: 0, y: 0 };
      bottom = Math.max(bottom, p[t.name].y + t.height!);
    });
  }
  packGrid(loose.map(boxOfTable), sp.node, 20, linked.length ? bottom + sp.rank : 20, p);
  return { pos: p, groupBoxAbs: {} };
}

export function layoutClustered(tables: Table[], refs: Ref[], sp: Spacing): LayoutResult {
  const groups: Record<string, { id: string | null; tables: Table[] }> = {};
  tables.forEach((t) => {
    (groups[t.group as string] ||= { id: t.group, tables: [] }).tables.push(t);
  });
  const gl = Object.values(groups);
  if (gl.length <= 1) return layoutFlat(tables, refs, sp);

  const boxes: Record<string, { w: number; h: number; local: Record<string, Point> }> = {};
  const inner: Spacing = { node: sp.node * 0.7, rank: sp.rank * 0.55, group: sp.group };
  gl.forEach((gr) => {
    // Each domain is laid out on its own — including the grid fallback for
    // tables that have no edges inside this domain.
    const local = layoutFlat(gr.tables, refs, inner).pos;
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1e9,
      y1 = -1e9;
    gr.tables.forEach((t) => {
      const l = local[t.name];
      x0 = Math.min(x0, l.x);
      y0 = Math.min(y0, l.y);
      x1 = Math.max(x1, l.x + t.width!);
      y1 = Math.max(y1, l.y + t.height!);
    });
    const padTop = 40,
      pad = 18;
    gr.tables.forEach((t) => {
      local[t.name].x += -x0 + pad;
      local[t.name].y += -y0 + padTop;
    });
    boxes[gr.id as string] = { w: x1 - x0 + pad * 2, h: y1 - y0 + padTop + pad, local };
  });

  // Meta-layout: place the domain boxes relative to one another. Domains with
  // no cross-domain relationship are gridded rather than stacked into a column.
  const linkedG = new Set<string>();
  const seen = new Set<string>();
  const crossEdges: Array<[string, string]> = [];
  refs.forEach((r) => {
    const gf = tableGroup(r.from.table),
      gt = tableGroup(r.to.table);
    if (gf && gt && gf !== gt && boxes[gf] && boxes[gt]) {
      const k = gf < gt ? gf + "|" + gt : gt + "|" + gf;
      if (seen.has(k)) return;
      seen.add(k);
      crossEdges.push([gf, gt]);
      linkedG.add(gf);
      linkedG.add(gt);
    }
  });

  const gpos: Record<string, Point> = {};
  let gBottom = 24;
  if (linkedG.size) {
    const mg = new graphlib.Graph();
    mg.setGraph({ rankdir: "LR", nodesep: sp.group, ranksep: sp.group * 1.15, marginx: 24, marginy: 24 });
    mg.setDefaultEdgeLabel(() => ({}));
    linkedG.forEach((id) => mg.setNode(id, { width: boxes[id].w, height: boxes[id].h }));
    crossEdges.forEach(([a, b]) => mg.setEdge(a, b));
    try {
      dagreLayout(mg);
    } catch (e) {
      /* ignore */
    }
    linkedG.forEach((id) => {
      const n = mg.node(id) || { x: 0, y: 0 };
      gpos[id] = { x: n.x - boxes[id].w / 2, y: n.y - boxes[id].h / 2 };
      gBottom = Math.max(gBottom, gpos[id].y + boxes[id].h);
    });
  }
  const looseG = gl.filter((gr) => !linkedG.has(gr.id as string));
  packGrid(
    looseG.map((gr) => ({ key: gr.id as string, w: boxes[gr.id as string].w, h: boxes[gr.id as string].h })),
    sp.group,
    24,
    linkedG.size ? gBottom + sp.group : 24,
    gpos
  );

  const p: Record<string, Point> = {};
  const gb: Record<string, GroupBox> = {};
  gl.forEach((gr) => {
    const id = gr.id as string;
    const box = boxes[id];
    const o = gpos[id] || { x: 0, y: 0 };
    gb[id] = { x: o.x, y: o.y, w: box.w, h: box.h };
    gr.tables.forEach((t) => {
      const l = box.local[t.name];
      p[t.name] = { x: o.x + l.x, y: o.y + l.y };
    });
  });
  return { pos: p, groupBoxAbs: gb };
}

export function relayout(): void {
  const t = visTables(),
    r = visRefs(),
    sp = spacingVals();
  const modeSel = document.getElementById("mode") as HTMLSelectElement;
  const res = modeSel.value === "domain" ? layoutClustered(t, r, sp) : layoutFlat(t, r, sp);
  state.pos = res.pos;
  state.groupBoxAbs = res.groupBoxAbs;
  fitView();
}
