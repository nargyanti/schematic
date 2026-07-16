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

export function layoutFlat(tables: Table[], refs: Ref[], sp: Spacing): LayoutResult {
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: sp.node, ranksep: sp.rank, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  const ns = new Set(tables.map((t) => t.name));
  tables.forEach((t) => {
    sizeTable(t);
    g.setNode(t.name, { width: t.width!, height: t.height! });
  });
  refs.forEach((r) => {
    if (ns.has(r.from.table) && ns.has(r.to.table)) g.setEdge(r.from.table, r.to.table);
  });
  try {
    dagreLayout(g);
  } catch (e) {
    /* dagre can throw on degenerate graphs */
  }
  const p: Record<string, Point> = {};
  tables.forEach((t) => {
    const n = g.node(t.name);
    p[t.name] = n ? { x: n.x - t.width! / 2, y: n.y - t.height! / 2 } : { x: 0, y: 0 };
  });
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
  gl.forEach((gr) => {
    const g = new graphlib.Graph();
    g.setGraph({
      rankdir: "LR",
      nodesep: sp.node * 0.7,
      ranksep: sp.rank * 0.55,
      marginx: 12,
      marginy: 12,
    });
    g.setDefaultEdgeLabel(() => ({}));
    const ns = new Set(gr.tables.map((t) => t.name));
    gr.tables.forEach((t) => {
      sizeTable(t);
      g.setNode(t.name, { width: t.width!, height: t.height! });
    });
    refs.forEach((r) => {
      if (ns.has(r.from.table) && ns.has(r.to.table)) g.setEdge(r.from.table, r.to.table);
    });
    try {
      dagreLayout(g);
    } catch (e) {
      /* ignore */
    }
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1e9,
      y1 = -1e9;
    const local: Record<string, Point> = {};
    gr.tables.forEach((t) => {
      const n = g.node(t.name) || { x: 0, y: 0 };
      const lx = n.x - t.width! / 2,
        ly = n.y - t.height! / 2;
      local[t.name] = { x: lx, y: ly };
      x0 = Math.min(x0, lx);
      y0 = Math.min(y0, ly);
      x1 = Math.max(x1, lx + t.width!);
      y1 = Math.max(y1, ly + t.height!);
    });
    const padTop = 40,
      pad = 18;
    gr.tables.forEach((t) => {
      local[t.name].x += -x0 + pad;
      local[t.name].y += -y0 + padTop;
    });
    boxes[gr.id as string] = { w: x1 - x0 + pad * 2, h: y1 - y0 + padTop + pad, local };
  });

  const mg = new graphlib.Graph();
  mg.setGraph({
    rankdir: "LR",
    nodesep: sp.group,
    ranksep: sp.group * 1.15,
    marginx: 24,
    marginy: 24,
  });
  mg.setDefaultEdgeLabel(() => ({}));
  gl.forEach((gr) =>
    mg.setNode(gr.id as string, { width: boxes[gr.id as string].w, height: boxes[gr.id as string].h })
  );
  const seen = new Set<string>();
  refs.forEach((r) => {
    const gf = tableGroup(r.from.table),
      gt = tableGroup(r.to.table);
    if (gf && gt && gf !== gt) {
      const k = gf < gt ? gf + "|" + gt : gt + "|" + gf;
      if (!seen.has(k)) {
        seen.add(k);
        mg.setEdge(gf, gt);
      }
    }
  });
  try {
    dagreLayout(mg);
  } catch (e) {
    /* ignore */
  }
  const p: Record<string, Point> = {};
  const gb: Record<string, GroupBox> = {};
  gl.forEach((gr) => {
    const n = mg.node(gr.id as string) || { x: 0, y: 0 };
    const box = boxes[gr.id as string];
    const ox = n.x - box.w / 2,
      oy = n.y - box.h / 2;
    gb[gr.id as string] = { x: ox, y: oy, w: box.w, h: box.h };
    gr.tables.forEach((t) => {
      const l = box.local[t.name];
      p[t.name] = { x: ox + l.x, y: oy + l.y };
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
