import { el } from "./geometry";
import { relayout } from "./layout";
import { softRefKey } from "./metrics";
import { buildDomainPanel, buildEnumPanel, buildFilterPanel, updateStat } from "./panels";
import { parseDBML } from "./parser";
import { applySnapshot, loadSession, setCurrentSchema, type RestoredView } from "./persist";
import { buildShell, renderContent } from "./render";
import { computeGraph, computeHubs, indexTables, rebuildEdges, resetFilter, state } from "./state";
import { applyView } from "./view";

const svg = () => document.getElementById("svg") as unknown as SVGSVGElement;

// Re-parse the editor and redraw. `fresh` = re-parse source (vs. just relayout).
export function update(fresh: boolean): void {
  const src = (document.getElementById("editor") as HTMLTextAreaElement).value;
  const errBox = document.getElementById("err")!;
  let restored: RestoredView = { pos: null, view: null };
  try {
    if (fresh) {
      state.model = parseDBML(src);
      indexTables();
      computeHubs();
      state.collapsed.clear();
      state.focusTable = null;
      state.colQuery = "";
      // Audit marks survive an edit to the schema text — an audit runs for days
      // and a stray keystroke must not wipe it. Only marks for tables that no
      // longer exist are dropped.
      const alive = new Set(state.model.tables.map((t) => t.name));
      for (const n in state.audit) if (!alive.has(n)) delete state.audit[n];
      state.activeGroups = new Set(state.model.groups.length ? state.model.groups.map((g) => g.id) : ["_"]);
      computeGraph();
      // Drop rejections that no longer name a guess in this schema.
      const liveKeys = new Set(state.softRefs.map(softRefKey));
      state.softOff.forEach((k) => liveKeys.has(k) || state.softOff.delete(k));
      resetFilter();
      buildDomainPanel();
      buildEnumPanel();

      // A previously saved session for this exact schema wins over the defaults.
      setCurrentSchema(src);
      const snap = loadSession(src);
      if (snap) {
        restored = applySnapshot(snap);
        // softOff came from the snapshot, so soft in-degrees need a recount.
        computeGraph();
      }
      buildFilterPanel();
      rebuildEdges();
    }
    if (!document.getElementById("viewport")) buildShell();
    if (state.model.tables.length === 0) {
      document.getElementById("content")!.innerHTML = "";
      const r = svg().getBoundingClientRect();
      const t = el("text", { x: r.width / 2, y: r.height / 2, "text-anchor": "middle" }, "empty");
      t.textContent = "No tables yet — paste a DBML schema on the left";
      document.getElementById("viewport")!.setAttribute("transform", "");
      document.getElementById("content")!.appendChild(t);
      document.getElementById("stat")!.textContent = "";
      errBox.classList.remove("show");
      return;
    }
    // Lay out first so domain boxes exist, then overlay any saved coordinates.
    relayout();
    if (restored.pos) Object.assign(state.pos, restored.pos);
    if (restored.view) {
      Object.assign(state.view, restored.view);
      applyView();
    }
    renderContent();
    updateStat();
    errBox.classList.remove("show");
  } catch (e) {
    errBox.textContent = "⚠ " + (e as Error).message;
    errBox.classList.add("show");
    console.error(e);
  }
}
