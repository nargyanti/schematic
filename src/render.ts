import { BADGE, COL_FONT, GAP, HEAD_H, PAD_X, ROW_H } from "./constants";
import {
  edgeGeom,
  el,
  groupColor,
  headPath,
  lighten,
  markEl,
  sizeTable,
  textW,
  visCols,
} from "./geometry";
import { isHubEdge, state, visRefs, visTables } from "./state";
import type { Point, Table } from "./types";

const svg = () => document.getElementById("svg") as unknown as SVGSVGElement;
const modeVal = () => (document.getElementById("mode") as HTMLSelectElement).value;

// Build the persistent SVG shell: grid pattern + viewport/content groups.
export function buildShell(): void {
  const s = svg();
  s.innerHTML = "";
  const defs = el("defs");
  const pat = el("pattern", { id: "grid", width: 22, height: 22, patternUnits: "userSpaceOnUse" });
  pat.appendChild(el("circle", { cx: 1, cy: 1, r: 1, fill: "#d9d5c8" }));
  defs.appendChild(pat);
  s.appendChild(defs);
  s.appendChild(el("rect", { width: "100%", height: "100%", fill: "url(#grid)" }));
  const vp = el("g", { id: "viewport" });
  vp.appendChild(el("g", { id: "content" }));
  s.appendChild(vp);
}

// Draw one table node as an SVG group.
export function makeTableEl(t: Table, p: Point): SVGElement {
  sizeTable(t);
  const col = t.group ? groupColor(t.group) : "#2b3a5c";
  const g = el("g", { transform: `translate(${p.x},${p.y})`, "data-table": t.name }, "grp" + (t.legacy ? " legacy" : ""));
  g.appendChild(el("rect", { x: 2, y: 3, rx: 9, width: t.width!, height: t.height! }, "tbl-shadow"));
  g.appendChild(el("rect", { x: 0, y: 0, rx: 9, width: t.width!, height: t.height! }, "tbl-body" + (t.legacy ? " legacy-body" : "")));
  g.appendChild(el("path", { d: headPath(t.width!), fill: col }));
  const nm = el("text", { x: PAD_X, y: HEAD_H / 2 + 5 }, "tbl-name");
  nm.textContent = t.name;
  g.appendChild(nm);
  let rightX = t.width! - 12;
  if (t.legacy) {
    const bw = 48;
    g.appendChild(el("rect", { x: t.width! - PAD_X - bw, y: HEAD_H / 2 - 8, rx: 4, width: bw, height: 16 }, "legacy-pill"));
    const lt = el("text", { x: t.width! - PAD_X - bw / 2, y: HEAD_H / 2 + 3.5, "text-anchor": "middle" }, "legacy-txt");
    lt.textContent = "LEGACY";
    g.appendChild(lt);
    rightX = t.width! - PAD_X - bw - 8;
  }
  if (t.note) {
    g.appendChild(el("circle", { cx: rightX, cy: HEAD_H / 2, r: 3 }, "note-dot"));
    const ti = el("title");
    ti.textContent = t.note;
    g.appendChild(ti);
  }
  const vc = visCols(t);
  vc.forEach((c, i) => {
    const y = HEAD_H + i * ROW_H;
    if (i > 0) g.appendChild(el("line", { x1: 0, y1: y, x2: t.width!, y2: y }, "col-sep"));
    const hit = el("rect", { x: 0, y: y, width: t.width!, height: ROW_H }, "row-hit");
    if (c.note) {
      const ti = el("title");
      ti.textContent = c.note;
      hit.appendChild(ti);
    }
    g.appendChild(hit);
    let bx = t.width! - PAD_X;
    if (c.note) {
      bx -= 8;
      g.appendChild(el("circle", { cx: bx + 2, cy: y + ROW_H / 2, r: 2.5 }, "row-note-dot"));
      bx -= 4;
    }
    if (c.pk) {
      bx -= BADGE;
      g.appendChild(el("rect", { x: bx, y: y + ROW_H / 2 - 8, rx: 4, width: BADGE - 4, height: 16 }, "pk-badge"));
      const b = el("text", { x: bx + (BADGE - 4) / 2, y: y + ROW_H / 2 + 3.5, "text-anchor": "middle" }, "pk-txt");
      b.textContent = "PK";
      g.appendChild(b);
    }
    if (c.fk) {
      bx -= BADGE;
      g.appendChild(el("rect", { x: bx, y: y + ROW_H / 2 - 8, rx: 4, width: BADGE - 4, height: 16 }, "fk-badge"));
      const b = el("text", { x: bx + (BADGE - 4) / 2, y: y + ROW_H / 2 + 3.5, "text-anchor": "middle" }, "fk-txt");
      b.textContent = "FK";
      g.appendChild(b);
    }
    const cn = el("text", { x: PAD_X, y: y + ROW_H / 2 + 4 }, "col-name");
    cn.textContent = c.name;
    g.appendChild(cn);
    if (c.type) {
      const ct = el("text", { x: PAD_X + textW(c.name, COL_FONT) + GAP, y: y + ROW_H / 2 + 4 }, "col-type");
      ct.textContent = c.type;
      g.appendChild(ct);
    }
  });
  if (state.collapsed.has(t.name) && t.columns.length) {
    const ci = el("text", { x: t.width! - PAD_X, y: HEAD_H / 2 + 4, "text-anchor": "end" }, "collapse-ind");
    ci.textContent = "▸ " + t.columns.length + " cols";
    g.appendChild(ci);
  }
  return g;
}

// Full redraw of groups + nodes + edges from current state.
export function renderContent(): void {
  const content = document.getElementById("content")!;
  content.innerHTML = "";
  const groupLayer = el("g", {}, "groups"),
    edgeLayer = el("g", {}, "edges"),
    nodeLayer = el("g", {}, "nodes");
  content.appendChild(groupLayer);
  content.appendChild(edgeLayer);
  content.appendChild(nodeLayer);
  for (const id in state.groupBoxAbs) {
    const b = state.groupBoxAbs[id],
      col = groupColor(id),
      g = state.model.groups.find((x) => x.id === id);
    groupLayer.appendChild(
      el("rect", { x: b.x, y: b.y, rx: 14, width: b.w, height: b.h, fill: lighten(col, 0.86), stroke: lighten(col, 0.35) }, "grp-box")
    );
    const title = g ? g.title : id,
      lw = textW(title, "700 13px Inter") + 20;
    groupLayer.appendChild(el("rect", { x: b.x + 12, y: b.y + 10, rx: 7, width: lw, height: 22, fill: col }));
    const tx = el("text", { x: b.x + 22, y: b.y + 25.5 }, "grp-label");
    tx.textContent = title;
    groupLayer.appendChild(tx);
  }
  visTables().forEach((t) => {
    const g = makeTableEl(t, state.pos[t.name] || { x: 0, y: 0 });
    nodeLayer.appendChild(g);
  });
  visRefs().forEach((r) => {
    const idx = state.model.refs.indexOf(r);
    const hub = isHubEdge(r);
    const path = el("path", { "data-ef": r.from.table, "data-et": r.to.table }, "edge" + (hub ? " hub" : ""));
    (path as SVGElement & { dataset: DOMStringMap }).dataset.ei = String(idx);
    edgeLayer.appendChild(path);
  });
  applyHubVisibility();
  routeEdges();
  bindDrag();
  applyFocus();
}

export function routeEdges(): void {
  document.querySelectorAll<SVGPathElement>(".edge").forEach((path) => {
    const r = state.model.refs[+path.dataset.ei!];
    if (!r) return;
    const g = edgeGeom(r, state.pos, state.tableByName);
    if (!g) return;
    path.setAttribute("d", g.d);
    ["from", "to"].forEach((end) => {
      const old = document.querySelector(`[data-mk="${path.dataset.ei}-${end}"]`);
      if (old) old.remove();
    });
    const hub = path.classList.contains("hub") ? " hub" : "",
      hide = path.classList.contains("hide") ? " hide" : "";
    const mf = markEl(g.A, g.aS, r.sym, "from", hub + hide);
    mf.setAttribute("data-mk", path.dataset.ei + "-from");
    path.parentNode!.appendChild(mf);
    const mt = markEl(g.B, g.bS, r.sym, "to", hub + hide);
    mt.setAttribute("data-mk", path.dataset.ei + "-to");
    path.parentNode!.appendChild(mt);
  });
}

export function applyHubVisibility(): void {
  const hide = (document.getElementById("hubToggle") as HTMLInputElement).checked && modeVal() === "domain";
  document.querySelectorAll(".edge.hub").forEach((e) => e.classList.toggle("hide", hide));
  document.querySelectorAll(".edge-mark.hub").forEach((e) => e.classList.toggle("hide", hide));
}

function bindDrag(): void {
  document.querySelectorAll<SVGGElement>(".grp").forEach((g) => {
    let sx = 0,
      sy = 0,
      ox = 0,
      oy = 0,
      name = "",
      moved = false;
    g.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      name = g.dataset.table!;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      ox = state.pos[name].x;
      oy = state.pos[name].y;
      g.classList.add("drag");
      g.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
        state.pos[name].x = ox + (ev.clientX - sx) / state.view.s;
        state.pos[name].y = oy + (ev.clientY - sy) / state.view.s;
        g.setAttribute("transform", `translate(${state.pos[name].x},${state.pos[name].y})`);
        routeEdges();
      };
      const up = () => {
        g.classList.remove("drag");
        g.removeEventListener("pointermove", move);
        g.removeEventListener("pointerup", up);
        if (!moved) setFocus(name);
      };
      g.addEventListener("pointermove", move);
      g.addEventListener("pointerup", up);
    });
    g.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const n = g.dataset.table!;
      if (state.collapsed.has(n)) state.collapsed.delete(n);
      else state.collapsed.add(n);
      renderContent();
    });
    g.addEventListener("pointerenter", () => hl(g.dataset.table!, true));
    g.addEventListener("pointerleave", () => hl(g.dataset.table!, false));
  });
}

function hl(name: string, on: boolean): void {
  document.querySelectorAll<SVGPathElement>(".edge").forEach((p) => {
    if (p.dataset.ef === name || p.dataset.et === name) {
      p.classList.toggle("hl", on);
      ["from", "to"].forEach((e) => {
        const m = document.querySelector(`[data-mk="${p.dataset.ei}-${e}"]`);
        m && m.classList.toggle("hl", on);
      });
    }
  });
}

export function setFocus(name: string): void {
  state.focusTable = state.focusTable === name ? null : name;
  applyFocus();
}

export function applyFocus(): void {
  const chip = document.getElementById("focusChip")!;
  if (!state.focusTable) {
    document.querySelectorAll(".dim,.focused").forEach((e) => e.classList.remove("dim", "focused"));
    chip.style.display = "none";
    return;
  }
  const conn = new Set([state.focusTable]);
  state.model.refs.forEach((r) => {
    if (r.from.table === state.focusTable) conn.add(r.to.table);
    if (r.to.table === state.focusTable) conn.add(r.from.table);
  });
  document.querySelectorAll<SVGGElement>(".grp").forEach((g) => {
    const n = g.dataset.table!;
    g.classList.toggle("dim", !conn.has(n));
    g.classList.toggle("focused", n === state.focusTable);
  });
  document.querySelectorAll<SVGPathElement>(".edge").forEach((p) => {
    const on = p.dataset.ef === state.focusTable || p.dataset.et === state.focusTable;
    p.classList.toggle("dim", !on);
    ["from", "to"].forEach((e) => {
      const m = document.querySelector(`[data-mk="${p.dataset.ei}-${e}"]`);
      m && m.classList.toggle("dim", !on);
    });
  });
  document.querySelectorAll(".grp-box").forEach((b) => b.classList.add("dim"));
  chip.textContent = "Focus: " + state.focusTable + "   ✕";
  chip.style.display = "";
}
