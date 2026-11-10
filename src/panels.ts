import { sizeTable } from "./geometry";
import { relayout } from "./layout";
import { ROLE_COLOR, ROLE_HINT, ROLE_LABEL, ROLES, softRefKey } from "./metrics";
import { applyFocus, renderContent } from "./render";
import {
  computeGraph,
  filterActive,
  metricOf,
  passesFilter,
  rebuildEdges,
  resetFilter,
  state,
  visRefs,
  visTables,
} from "./state";
import type { Table } from "./types";
import { applyView } from "./view";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = () => document.getElementById("svg") as unknown as SVGSVGElement;

/** Set by main.ts so panels can persist without importing the storage module. */
export const panelHooks = {
  changed: () => {},
  /** Fired by refresh() — visibility changed, so the table list's greyed rows are stale. */
  visibilityChanged: () => {},
};

export type Preset = "master" | "unref" | "config" | "trx";

// Domain (group) toggle panel — one checkbox per domain.
export function buildDomainPanel(): void {
  const list = $("dpList");
  list.innerHTML = "";
  const btn = $("btnDomain");
  if (state.model.groups.length === 0) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "";
  state.model.groups.forEach((g) => {
    const cnt = state.model.tables.filter((t) => t.group === g.id).length;
    const row = document.createElement("label");
    row.className = "d-row";
    row.innerHTML = `<input type="checkbox" ${state.activeGroups.has(g.id) ? "checked" : ""}><span class="sw" style="background:${g.color}"></span><span>${g.title}</span><span class="cnt">${cnt}</span>`;
    row.querySelector("input")!.addEventListener("change", (e) => {
      if ((e.target as HTMLInputElement).checked) state.activeGroups.add(g.id);
      else state.activeGroups.delete(g.id);
      refresh();
    });
    list.appendChild(row);
  });
}

// Read-only list of enums declared in the schema.
export function buildEnumPanel(): void {
  const list = $("enumList"),
    btn = $("btnEnum"),
    names = Object.keys(state.model.enums);
  if (!names.length) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "";
  list.innerHTML = "";
  names.forEach((n) => {
    const row = document.createElement("div");
    row.className = "e-row";
    row.innerHTML = `<b>${n}</b><br><span>${state.model.enums[n].join(" · ")}</span>`;
    list.appendChild(row);
  });
}

// ── Filter panel ────────────────────────────────────────────────────────────

/** Point the FK sliders at the schema's actual degree range. */
export function syncFilterBounds(): void {
  const f = state.filter;
  // A fresh schema starts with an open-ended max; clamp it to the real range.
  f.outMax = Math.min(f.outMax, state.maxOut);
  f.inMax = Math.min(f.inMax, state.maxIn);
  f.outMin = Math.min(f.outMin, f.outMax);
  f.inMin = Math.min(f.inMin, f.inMax);
  const set = (id: string, max: number, val: number) => {
    const e = $<HTMLInputElement>(id);
    e.max = String(max);
    e.value = String(val);
  };
  set("fkOutMin", state.maxOut, f.outMin);
  set("fkOutMax", state.maxOut, f.outMax);
  set("fkInMin", state.maxIn, f.inMin);
  set("fkInMax", state.maxIn, f.inMax);
  $("fkOutLbl").textContent = `${f.outMin} – ${f.outMax}`;
  $("fkInLbl").textContent = `${f.inMin} – ${f.inMax}`;
}

export function buildRoleList(): void {
  const list = $("roleList");
  list.innerHTML = "";
  ROLES.forEach((r) => {
    const row = document.createElement("label");
    row.className = "role-row";
    row.innerHTML =
      `<input type="checkbox" ${state.filter.roles.has(r) ? "checked" : ""}>` +
      `<span class="tag" style="background:${ROLE_COLOR[r]}">${ROLE_LABEL[r]}</span>` +
      `<span class="cnt">${state.roleCount[r]}</span>` +
      `<span class="hint">${ROLE_HINT[r]}</span>`;
    row.querySelector("input")!.addEventListener("change", (e) => {
      if ((e.target as HTMLInputElement).checked) state.filter.roles.add(r);
      else state.filter.roles.delete(r);
      refresh();
    });
    list.appendChild(row);
  });
}

/**
 * Inferred relationships, grouped by the table they point at — the reading that
 * matters for zero-FK tables, since the question is "who reads this?".
 */
export function buildSoftList(): void {
  const list = $("softList");
  list.innerHTML = "";
  $("softCount").textContent = String(state.softRefs.filter((r) => !state.softOff.has(softRefKey(r))).length);
  const byTarget: Record<string, typeof state.softRefs> = {};
  state.softRefs.forEach((r) => (byTarget[r.to.table] ||= []).push(r));
  const targets = Object.keys(byTarget).sort((a, b) => byTarget[b].length - byTarget[a].length);
  targets.forEach((tgt) => {
    const refs = byTarget[tgt];
    const live = refs.filter((r) => !state.softOff.has(softRefKey(r))).length;
    const head = document.createElement("div");
    head.className = "soft-row cursor-pointer" + (live ? "" : " off");
    head.innerHTML =
      `<span class="text-[#28324d] font-semibold">${tgt}</span>` +
      `<span class="text-[#98a0b6]">← ${live}/${refs.length}</span>` +
      `<button class="x" title="reject every guess pointing at this table">✕</button>`;
    const kids = document.createElement("div");
    kids.className = "hidden pl-3";
    refs.forEach((r) => {
      const k = softRefKey(r);
      const row = document.createElement("div");
      row.className = "soft-row" + (state.softOff.has(k) ? " off" : "");
      row.innerHTML =
        `<span>${r.from.table}.<b>${r.from.col}</b></span>` +
        `<span class="text-[#b6bdcd]">${r.conf === "weak" ? "?" : "→"}</span>` +
        `<button class="x">✕</button>`;
      row.querySelector("button")!.addEventListener("click", (e) => {
        e.stopPropagation();
        if (state.softOff.has(k)) state.softOff.delete(k);
        else state.softOff.add(k);
        refreshSoft();
      });
      kids.appendChild(row);
    });
    head.addEventListener("click", () => kids.classList.toggle("hidden"));
    head.querySelector("button")!.addEventListener("click", (e) => {
      e.stopPropagation();
      const off = live > 0;
      refs.forEach((r) => (off ? state.softOff.add(softRefKey(r)) : state.softOff.delete(softRefKey(r))));
      refreshSoft();
    });
    list.appendChild(head);
    list.appendChild(kids);
  });
  if (!targets.length)
    list.innerHTML = `<div class="soft-row text-[#98a0b6]">No relationships could be inferred.</div>`;
}

export function buildFilterPanel(): void {
  syncFilterBounds();
  buildRoleList();
  buildSoftList();
  $<HTMLInputElement>("softToggle").checked = state.showSoft;
  $<HTMLInputElement>("auditHide").checked = state.filter.hideDone;
  updateFilterBadge();
}

export function updateFilterBadge(): void {
  const badge = $("filterBadge");
  const hidden = state.model.tables.filter((t) => !passesFilter(t)).length;
  if (filterActive() && hidden) {
    badge.textContent = "−" + hidden;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

export function updateStat(): void {
  const done = Object.values(state.audit).filter((m) => m === "done").length;
  const total = state.model.tables.length;
  let s = `${visTables().length}/${total} tables · ${visRefs().length} relations`;
  if (done) s += ` · ✓ ${done}/${total}`;
  if (state.struck.size) s += ` · ⌀ ${state.struck.size} struck`;
  $("stat").textContent = s;
  $("auditCount").textContent = String(done);
}

export function togglePanel(id: string): void {
  ["domainPanel", "enumPanel", "filterPanel", "issuesPanel", "tablesPanel"].forEach((p) => {
    if (p === id) $(p).classList.toggle("show");
    else $(p).classList.remove("show");
  });
}

/** Redraw everything that depends on which tables are visible. */
export function refresh(): void {
  relayout();
  renderContent();
  updateStat();
  updateFilterBadge();
  panelHooks.changed();
  panelHooks.visibilityChanged();
}

/** Same, but the soft-ref set changed so metrics and the list must rebuild. */
export function refreshSoft(): void {
  // Soft in-degree feeds the role tooltip, so recompute before redrawing.
  computeGraph();
  rebuildEdges();
  buildSoftList();
  buildRoleList();
  refresh();
}

// ── Search ──────────────────────────────────────────────────────────────────

/** Tables matching `q` by name, column name, or note — best matches first. */
export function searchMatches(q: string): Table[] {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const exactName: Table[] = [],
    partName: Table[] = [],
    exactCol: Table[] = [],
    partCol: Table[] = [],
    inNote: Table[] = [];
  for (const t of state.model.tables) {
    const n = t.name.toLowerCase();
    if (n === q) exactName.push(t);
    else if (n.includes(q)) partName.push(t);
    else if (t.columns.some((c) => c.name.toLowerCase() === q)) exactCol.push(t);
    else if (t.columns.some((c) => c.name.toLowerCase().includes(q))) partCol.push(t);
    else if (
      (t.note || "").toLowerCase().includes(q) ||
      t.columns.some((c) => (c.note || "").toLowerCase().includes(q))
    )
      inNote.push(t);
  }
  return [...exactName, ...partName, ...exactCol, ...partCol, ...inNote];
}

/** Widen filters just enough that `t` can actually be drawn. */
function ensureVisible(t: Table): boolean {
  let changed = false;
  if (!state.activeGroups.has(t.group || "_")) {
    state.activeGroups.add(t.group || "_");
    buildDomainPanel();
    changed = true;
  }
  if (!passesFilter(t)) {
    const m = metricOf(t.name);
    const f = state.filter;
    f.roles.add(m.role);
    f.outMin = Math.min(f.outMin, m.out);
    f.outMax = Math.max(f.outMax, m.out);
    f.inMin = Math.min(f.inMin, m.in);
    f.inMax = Math.max(f.inMax, m.in);
    if (state.audit[t.name] === "done") f.hideDone = false;
    buildFilterPanel();
    changed = true;
  }
  return changed;
}

let lastQuery = "";
let matchIdx = -1;

/** Center + focus the next table matching `q`; repeated calls cycle matches. */
export function jumpTo(q: string): void {
  const norm = q.trim().toLowerCase();
  const hits = searchMatches(norm);
  if (!hits.length) {
    $("searchCount").textContent = norm ? "0" : "";
    return;
  }
  matchIdx = norm === lastQuery ? (matchIdx + 1) % hits.length : 0;
  lastQuery = norm;
  $("searchCount").textContent = `${matchIdx + 1}/${hits.length}`;

  const t = hits[matchIdx];
  const wasHidden = ensureVisible(t);
  if (state.colQuery !== norm || wasHidden) {
    state.colQuery = norm;
    if (wasHidden) relayout();
    renderContent();
    updateStat();
    updateFilterBadge();
  }
  centerAndFocus(t);
}

/** Pan/zoom so `t` sits mid-canvas, then focus it. */
function centerAndFocus(t: Table): void {
  const p = state.pos[t.name];
  if (!p) return;
  sizeTable(t);
  const r = svg().getBoundingClientRect();
  state.view.s = 0.95;
  state.view.x = r.width / 2 - (p.x + t.width! / 2) * state.view.s;
  state.view.y = r.height / 2 - (p.y + t.height! / 2) * state.view.s;
  applyView();
  state.focusTable = t.name;
  state.pathTo = null;
  applyFocus();
}

/** Jump to a table by exact name (used by the Issues panel), unhiding it if needed. */
export function focusTableByName(name: string): void {
  const t = state.tableByName[name];
  if (!t) return;
  if (ensureVisible(t)) {
    relayout();
    renderContent();
    updateStat();
    updateFilterBadge();
  }
  centerAndFocus(t);
}

/** Clear the search highlight without touching focus. */
export function clearSearch(): void {
  if (!state.colQuery) return;
  state.colQuery = "";
  lastQuery = "";
  matchIdx = -1;
  $("searchCount").textContent = "";
  renderContent();
}

export function resetAllFilters(): void {
  resetFilter();
  buildFilterPanel();
  refresh();
}

/**
 * One-click cuts through the schema. "unref" is the one that matters during an
 * audit: in-degree 0 means no ERD line ever leads here, so these tables are
 * only reachable by reading code — settings, parameters, resolver lookups.
 */
export function applyPreset(name: Preset): void {
  resetFilter();
  const f = state.filter;
  if (name === "master") {
    f.outMax = 0;
    f.inMin = 1;
  } else if (name === "unref") {
    f.inMax = 0;
  } else if (name === "config") {
    // Nothing points here and it barely points anywhere: settings, parameters,
    // lookup tables. Leaf *documents* are excluded by the low out-degree cap.
    f.inMax = 0;
    f.outMax = Math.min(2, state.maxOut);
  } else {
    f.outMin = 1;
    f.roles = new Set(["trx", "pivot"]);
  }
  buildFilterPanel();
  refresh();
}
