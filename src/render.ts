import { BADGE, COL_FONT, GAP, HEAD_H, PAD_X, ROW_H } from "./constants";
import {
  edgeGeom,
  el,
  groupColor,
  headPath,
  lighten,
  markEl,
  roleBadgeW,
  sizeTable,
  textW,
  visCols,
} from "./geometry";
import { ROLE_LABEL } from "./metrics";
import { isHubEdge, neighborhood, state, visRefs, visTables, type AuditMark } from "./state";
import type { Point, Ref, Table } from "./types";

const svg = () => document.getElementById("svg") as unknown as SVGSVGElement;
const modeVal = () => (document.getElementById("mode") as HTMLSelectElement).value;

/** Cycle order for the right-click audit mark. */
const AUDIT_CYCLE: Array<AuditMark | undefined> = ["done", "warn", "skip", undefined];

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

/** CSS classes for one edge, distinguishing declared FKs from inferred guesses. */
function edgeClass(r: Ref): string {
  if (r.inferred) return "edge soft" + (r.conf === "weak" ? " weak" : "");
  return "edge" + (isHubEdge(r) ? " hub" : "");
}

// Draw one table node as an SVG group.
export function makeTableEl(t: Table, p: Point): SVGElement {
  sizeTable(t);
  const col = t.group ? groupColor(t.group) : "#2b3a5c";
  const mark = state.audit[t.name];
  const cls = "grp" + (t.legacy ? " legacy" : "") + (mark ? " audit-" + mark : "");
  const g = el("g", { transform: `translate(${p.x},${p.y})`, "data-table": t.name }, cls);
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
  // Role pill: MASTER / TRX / PIVOT / ORPHAN, derived from FK degrees.
  const met = state.metrics[t.name];
  if (met) {
    const bw = roleBadgeW(t);
    g.appendChild(el("rect", { x: rightX - bw, y: HEAD_H / 2 - 8, rx: 4, width: bw, height: 16 }, "role-pill"));
    const rt = el("text", { x: rightX - bw / 2, y: HEAD_H / 2 + 3, "text-anchor": "middle" }, "role-txt");
    rt.textContent = ROLE_LABEL[met.role];
    g.appendChild(rt);
    const ti = el("title");
    ti.textContent = `${ROLE_LABEL[met.role]} — FK out ${met.out}, FK in ${met.in}` + (met.softIn ? `, inferred in ${met.softIn}` : "");
    rt.appendChild(ti);
    rightX -= bw + 8;
  }
  if (t.note) {
    g.appendChild(el("circle", { cx: rightX, cy: HEAD_H / 2, r: 3 }, "note-dot"));
    const ti = el("title");
    ti.textContent = t.note;
    g.appendChild(ti);
  }
  const q = state.colQuery;
  const vc = visCols(t);
  vc.forEach((c, i) => {
    const y = HEAD_H + i * ROW_H;
    if (i > 0) g.appendChild(el("line", { x1: 0, y1: y, x2: t.width!, y2: y }, "col-sep"));
    if (q && c.name.toLowerCase().includes(q))
      g.appendChild(el("rect", { x: 1, y: y + 1, width: t.width! - 2, height: ROW_H - 2 }, "row-match"));
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
  // Audit stripe last so it stays on top of the header fill.
  if (mark) g.appendChild(el("rect", { x: 0, y: 0, rx: 2, width: 4, height: t.height! }, "audit-bar " + mark));
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
    const idx = state.edges.indexOf(r);
    const path = el("path", { "data-ef": r.from.table, "data-et": r.to.table }, edgeClass(r));
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
    const r = state.edges[+path.dataset.ei!];
    if (!r) return;
    const g = edgeGeom(r, state.pos, state.tableByName);
    if (!g) return;
    path.setAttribute("d", g.d);
    ["from", "to"].forEach((end) => {
      const old = document.querySelector(`[data-mk="${path.dataset.ei}-${end}"]`);
      if (old) old.remove();
    });
    const hub = path.classList.contains("hub") ? " hub" : "",
      hide = path.classList.contains("hide") ? " hide" : "",
      soft = path.classList.contains("soft") ? " soft" : "",
      weak = path.classList.contains("weak") ? " weak" : "";
    const extra = hub + hide + soft + weak;
    const mf = markEl(g.A, g.aS, r.sym, "from", extra);
    mf.setAttribute("data-mk", path.dataset.ei + "-from");
    path.parentNode!.appendChild(mf);
    const mt = markEl(g.B, g.bS, r.sym, "to", extra);
    mt.setAttribute("data-mk", path.dataset.ei + "-to");
    path.parentNode!.appendChild(mt);
  });
}

export function applyHubVisibility(): void {
  const hide = (document.getElementById("hubToggle") as HTMLInputElement).checked && modeVal() === "domain";
  document.querySelectorAll(".edge.hub").forEach((e) => e.classList.toggle("hide", hide));
  document.querySelectorAll(".edge-mark.hub").forEach((e) => e.classList.toggle("hide", hide));
}

/** Advance a table's audit mark one step through the cycle. */
export function cycleAudit(name: string): void {
  const cur = state.audit[name];
  const next = AUDIT_CYCLE[(AUDIT_CYCLE.indexOf(cur) + 1) % AUDIT_CYCLE.length];
  if (next) state.audit[name] = next;
  else delete state.audit[name];
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
      if (!state.pos[name]) return;
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
        else onLayoutChange();
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
      onLayoutChange();
    });
    g.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cycleAudit(g.dataset.table!);
      onAuditChange();
    });
    g.addEventListener("pointerenter", () => hl(g.dataset.table!, true));
    g.addEventListener("pointerleave", () => hl(g.dataset.table!, false));
  });
}

// Wired up by main.ts — kept as hooks so render.ts stays free of persistence
// and panel dependencies (which would import back into render.ts).
export const hooks = {
  layoutChanged: () => {},
  auditChanged: () => {},
};
const onLayoutChange = () => hooks.layoutChanged();
const onAuditChange = () => hooks.auditChanged();

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
    chip.classList.add("hidden");
    chip.classList.remove("flex");
    return;
  }
  const conn = neighborhood(state.focusTable, state.focusHops);
  document.querySelectorAll<SVGGElement>(".grp").forEach((g) => {
    const n = g.dataset.table!;
    g.classList.toggle("dim", !conn.has(n));
    g.classList.toggle("focused", n === state.focusTable);
  });
  document.querySelectorAll<SVGPathElement>(".edge").forEach((p) => {
    // An edge stays lit when both ends are inside the neighborhood — that is
    // what makes hops 2–3 show a connected sub-graph rather than a lone star.
    const on = conn.has(p.dataset.ef!) && conn.has(p.dataset.et!);
    p.classList.toggle("dim", !on);
    ["from", "to"].forEach((e) => {
      const m = document.querySelector(`[data-mk="${p.dataset.ei}-${e}"]`);
      m && m.classList.toggle("dim", !on);
    });
  });
  document.querySelectorAll(".grp-box").forEach((b) => b.classList.add("dim"));
  document.getElementById("focusName")!.textContent =
    "Focus: " + state.focusTable + (state.focusHops > 1 ? ` · ${conn.size} tabel` : "");
  document.querySelectorAll<HTMLButtonElement>("#hopSeg button").forEach((b) => {
    b.classList.toggle("bg-white/30", +b.dataset.h! === state.focusHops);
  });
  chip.classList.remove("hidden");
  chip.classList.add("flex");
}
