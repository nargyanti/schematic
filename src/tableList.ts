// "Tables ▾" panel: every table in the schema as a filterable, sortable list.
// Click a row to centre + focus it. Plain DOM, rebuilt on demand (never while
// the panel is closed) — a few hundred rows is cheap enough not to need
// virtualisation.

import { groupColor } from "./geometry";
import { focusTableByName, togglePanel } from "./panels";
import { metricOf, state, visTables, type AuditMark } from "./state";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type SortKey = "name" | "in" | "out" | "audit";

const MARK_ICON: Record<AuditMark, string> = { done: "✓", warn: "⚠", skip: "—" };
/** Audit sort puts what still needs attention first: check, unmarked, done, ignored. */
const AUDIT_ORDER: Record<string, number> = { warn: 0, none: 1, done: 2, skip: 3 };

/** The data changed while the panel was closed; rebuild when it next opens. */
let dirty = true;

const isOpen = () => $("tablesPanel").classList.contains("show");

interface Row {
  name: string;
  group: string | null;
  fkIn: number;
  fkOut: number;
  mark: AuditMark | undefined;
  note: boolean;
}

function collectRows(): Row[] {
  return state.model.tables.map((t) => {
    const m = metricOf(t.name);
    return {
      name: t.name,
      group: t.group,
      fkIn: m.in,
      fkOut: m.out,
      mark: state.audit[t.name],
      note: !!state.auditNotes[t.name],
    };
  });
}

const SORTERS: Record<SortKey, (a: Row, b: Row) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  in: (a, b) => b.fkIn - a.fkIn || a.name.localeCompare(b.name),
  out: (a, b) => b.fkOut - a.fkOut || a.name.localeCompare(b.name),
  audit: (a, b) => AUDIT_ORDER[a.mark || "none"] - AUDIT_ORDER[b.mark || "none"] || a.name.localeCompare(b.name),
};

function rowEl(r: Row, hidden: boolean): HTMLElement {
  const row = document.createElement("div");
  row.className = "t-row" + (hidden ? " is-hidden" : "");
  row.dataset.table = r.name;
  const mark = document.createElement("span");
  mark.className = "t-mark " + (r.mark || "");
  mark.textContent = r.mark ? MARK_ICON[r.mark] : "";
  const dot = document.createElement("span");
  dot.className = "sw";
  dot.style.background = groupColor(r.group);
  const name = document.createElement("span");
  name.className = "t-name";
  name.textContent = r.name;
  row.append(mark, dot, name);
  if (hidden) {
    const h = document.createElement("span");
    h.className = "t-hint";
    h.textContent = "hidden";
    h.title = "Filtered out or its domain is off — clicking shows it";
    row.appendChild(h);
  }
  const deg = document.createElement("span");
  deg.className = "t-deg";
  deg.textContent = `in ${r.fkIn} · out ${r.fkOut}`;
  deg.title = `${r.fkIn} tables point at it, it owns ${r.fkOut} foreign keys`;
  row.appendChild(deg);
  const note = document.createElement("span");
  note.className = "t-note";
  note.textContent = r.note ? "📝" : "";
  row.appendChild(note);
  return row;
}

/** Rebuild the rows from current state (filter text + sort applied). */
export function buildTableList(): void {
  dirty = false;
  const q = $<HTMLInputElement>("tlFilter").value.trim().toLowerCase();
  const sort = $<HTMLSelectElement>("tlSort").value as SortKey;
  const all = collectRows();
  const shown = (q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all).sort(SORTERS[sort]);
  const visible = new Set(visTables().map((t) => t.name));

  const frag = document.createDocumentFragment();
  for (const r of shown) frag.appendChild(rowEl(r, !visible.has(r.name)));
  const list = $("tlList");
  list.replaceChildren(frag);
  if (!shown.length) list.innerHTML = `<div class="soft-row text-[#98a0b6]">No tables match.</div>`;
  $("tlCount").textContent = `${shown.length} of ${all.length}`;
}

/** Something the list shows changed (re-parse, audit, filters): rebuild now if open, else on next open. */
export function refreshTableList(): void {
  if (isOpen()) buildTableList();
  else dirty = true;
}

/** Open the panel (if closed) and put the caret in the filter box. */
export function openTableList(): void {
  if (!isOpen()) togglePanel("tablesPanel");
  if (dirty) buildTableList();
  const box = $<HTMLInputElement>("tlFilter");
  box.focus();
  box.select();
}

export function initTableList(): void {
  $("btnTables").onclick = () => {
    togglePanel("tablesPanel");
    if (isOpen() && dirty) buildTableList();
  };
  const filter = $<HTMLInputElement>("tlFilter");
  filter.addEventListener("input", buildTableList);
  filter.addEventListener("keydown", (e) => {
    // Shortcuts ignore typing targets, so Esc and Enter are handled here.
    if (e.key === "Escape") {
      e.preventDefault();
      $("tablesPanel").classList.remove("show");
      filter.blur();
    } else if (e.key === "Enter") {
      const first = $("tlList").querySelector<HTMLElement>(".t-row");
      if (first) first.click();
    }
  });
  $("tlSort").addEventListener("change", buildTableList);
  $("tlList").addEventListener("click", (e) => {
    const row = (e.target as Element).closest<HTMLElement>(".t-row");
    if (!row) return;
    focusTableByName(row.dataset.table!);
    // Focusing may have unhidden the table, so greyed rows can be stale.
    buildTableList();
  });
}
