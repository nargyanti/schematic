import { el } from "./geometry";
import { relayout } from "./layout";
import { buildDomainPanel, buildEnumPanel, updateStat } from "./panels";
import { parseDBML } from "./parser";
import { buildShell, renderContent } from "./render";
import { computeHubs, indexTables, state } from "./state";

const svg = () => document.getElementById("svg") as unknown as SVGSVGElement;

// Re-parse the editor and redraw. `fresh` = re-parse source (vs. just relayout).
export function update(fresh: boolean): void {
  const src = (document.getElementById("editor") as HTMLTextAreaElement).value;
  const errBox = document.getElementById("err")!;
  try {
    if (fresh) {
      state.model = parseDBML(src);
      indexTables();
      computeHubs();
      state.collapsed.clear();
      state.focusTable = null;
      state.activeGroups = new Set(state.model.groups.length ? state.model.groups.map((g) => g.id) : ["_"]);
      buildDomainPanel();
      buildEnumPanel();
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
    relayout();
    renderContent();
    updateStat();
    errBox.classList.remove("show");
  } catch (e) {
    errBox.textContent = "⚠ " + (e as Error).message;
    errBox.classList.add("show");
    console.error(e);
  }
}
