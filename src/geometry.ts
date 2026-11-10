import { BADGE, COL_FONT, GAP, HEAD_H, NAME_FONT, PAD_X, ROLE_FONT, ROW_H, TYPE_FONT } from "./constants";
import { ROLE_LABEL } from "./metrics";
import { state } from "./state";
import type { Column, EdgeGeometry, Point, Ref, Table } from "./types";

export const NS = "http://www.w3.org/2000/svg";

// SVG element factory: tag, attributes, optional class.
export function el(tag: string, attrs?: Record<string, string | number>, cls?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  if (cls) e.setAttribute("class", cls);
  for (const k in attrs || {}) e.setAttribute(k, String(attrs![k]));
  return e;
}

// Offscreen canvas used to measure text widths.
const meas = document.createElement("canvas").getContext("2d")!;
export function textW(s: string, f: string): number {
  meas.font = f;
  return meas.measureText(s).width;
}

// Columns currently visible for a table (respects collapse + "keys only").
export function visCols(t: Table): Column[] {
  if (state.collapsed.has(t.name)) return [];
  if (state.hideNonKey) return t.columns.filter((c) => c.pk || c.fk);
  return t.columns;
}

// Width of the MASTER/TRX/PIVOT/ORPHAN pill drawn in the table header.
export function roleBadgeW(t: Table): number {
  const m = state.metrics[t.name];
  return m ? Math.ceil(textW(ROLE_LABEL[m.role], ROLE_FONT)) + 12 : 0;
}

// Compute width/height for a table based on its visible columns.
export function sizeTable(t: Table): void {
  const vc = visCols(t);
  let w = textW(t.name, NAME_FONT) + PAD_X * 2 + 30 + (t.legacy ? 50 : 0) + roleBadgeW(t) + 8 + (state.auditNotes[t.name] ? 18 : 0);
  vc.forEach((c) => {
    const b = (c.pk ? BADGE : 0) + (c.fk ? BADGE : 0) + (c.note ? 8 : 0);
    const cw = textW(c.name, COL_FONT) + textW(c.type || "", TYPE_FONT) + GAP + PAD_X * 2 + b + 8;
    if (cw > w) w = cw;
  });
  t.width = Math.max(150, Math.ceil(w));
  t.height = HEAD_H + vc.length * ROW_H;
}

export function groupColor(id: string | null): string {
  const g = state.model.groups.find((x) => x.id === id);
  return g ? g.color : "#2b3a5c";
}

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt * 255);
  const g = Math.min(255, ((n >> 8) & 255) + amt * 255);
  const b = Math.min(255, (n & 255) + amt * 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function headPath(w: number): string {
  return `M0 ${HEAD_H} L0 9 Q0 0 9 0 L${w - 9} 0 Q${w} 0 ${w} 9 L${w} ${HEAD_H} Z`;
}

// Vertical center of a column row within a table (local coordinates).
export function colY(t: Table, cn: string): number {
  const vc = visCols(t);
  const i = vc.findIndex((c) => c.name === cn);
  if (i < 0) return HEAD_H / 2;
  return HEAD_H + i * ROW_H + ROW_H / 2;
}

// Bezier path + endpoints for a relationship edge.
export function edgeGeom(
  r: Ref,
  posMap: Record<string, Point>,
  tmap: Record<string, Table>
): EdgeGeometry | null {
  const ta = tmap[r.from.table];
  const tb = tmap[r.to.table];
  const pa = posMap[r.from.table];
  const pb = posMap[r.to.table];
  if (!ta || !tb || !pa || !pb) return null;
  const acx = pa.x + ta.width! / 2;
  const bcx = pb.x + tb.width! / 2;
  const aS: "l" | "r" = bcx >= acx ? "r" : "l";
  const bS: "l" | "r" = bcx >= acx ? "l" : "r";
  const A = { x: aS === "r" ? pa.x + ta.width! : pa.x, y: pa.y + colY(ta, r.from.col) };
  const B = { x: bS === "r" ? pb.x + tb.width! : pb.x, y: pb.y + colY(tb, r.to.col) };
  const dx = Math.max(40, Math.abs(B.x - A.x) * 0.5);
  return {
    d: `M${A.x},${A.y} C${A.x + (aS === "r" ? dx : -dx)},${A.y} ${B.x + (bS === "r" ? dx : -dx)},${B.y} ${B.x},${B.y}`,
    A,
    B,
    aS,
    bS,
  };
}

// Crow's-foot / single mark at an edge endpoint.
export function markEl(
  pt: Point,
  side: "l" | "r",
  sym: string,
  end: "from" | "to",
  extra?: string
): SVGElement {
  const dir = side === "r" ? 1 : -1;
  const g = el("g", {}, "edge-mark" + (extra || ""));
  const s = sym || ">";
  let many = end === "from" ? s.includes(">") : s.includes("<");
  if (s === "-") many = false;
  const x = pt.x;
  const y = pt.y;
  const o = dir * 12;
  if (many) {
    g.appendChild(el("path", { d: `M${x + o},${y - 6} L${x},${y} L${x + o},${y + 6}` }));
    g.appendChild(el("line", { x1: x + o, y1: y, x2: x, y2: y }));
  } else {
    g.appendChild(el("line", { x1: x + o, y1: y - 6, x2: x + o, y2: y + 6 }));
    g.appendChild(el("line", { x1: x + o, y1: y, x2: x, y2: y }));
  }
  return g;
}
