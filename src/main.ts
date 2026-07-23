import "./style.css";
import { SAMPLE } from "./constants";
import { initExport } from "./export";
import { initIO } from "./io";
import { relayout } from "./layout";
import {
  applyPreset,
  buildDomainPanel,
  clearSearch,
  jumpTo,
  panelHooks,
  refresh,
  resetAllFilters,
  searchMatches,
  togglePanel,
  updateStat,
  type Preset,
} from "./panels";
import { loadLastSource, saveSession } from "./persist";
import { applyFocus, applyHubVisibility, buildShell, hooks, renderContent } from "./render";
import { rebuildEdges, state } from "./state";
import { update } from "./update";
import { fitView, initPanZoom, zoomBy } from "./view";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = $<HTMLTextAreaElement>("editor");
const modeSel = $<HTMLSelectElement>("mode");

const debounce = (fn: () => void, ms: number) => {
  let t: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
};

// Every interaction that changes something worth remembering funnels here.
hooks.layoutChanged = saveSession;
hooks.auditChanged = () => {
  renderContent();
  updateStat();
  saveSession();
};
panelHooks.changed = saveSession;

// ── Pan / zoom ──
initPanZoom();
$("zIn").onclick = () => zoomBy(1.2);
$("zOut").onclick = () => zoomBy(1 / 1.2);
$("zReset").onclick = fitView;

// ── Search: live column highlight, Enter cycles matches ──
const searchBox = $<HTMLInputElement>("search");
const applyHighlight = debounce(() => {
  const q = searchBox.value.trim().toLowerCase();
  const next = q.length >= 2 ? q : "";
  $("searchCount").textContent = q ? String(searchMatches(q).length) : "";
  if (next === state.colQuery) return;
  state.colQuery = next;
  renderContent();
}, 250);
searchBox.addEventListener("input", applyHighlight);
searchBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter") jumpTo(searchBox.value);
  else if (e.key === "Escape") {
    searchBox.value = "";
    clearSearch();
  }
});

// ── Export + IO buttons ──
initExport();
initIO();

// ── Editor ──
let deb: ReturnType<typeof setTimeout>;
editor.addEventListener("input", () => {
  clearTimeout(deb);
  deb = setTimeout(() => update(true), 300);
});
editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const s = editor.selectionStart,
      en = editor.selectionEnd;
    editor.value = editor.value.slice(0, s) + "  " + editor.value.slice(en);
    editor.selectionStart = editor.selectionEnd = s + 2;
  }
});

// ── Toolbar ──
$("btnFit").onclick = () => {
  relayout();
  renderContent();
  saveSession();
};
$("btnSample").onclick = () => {
  editor.value = SAMPLE;
  update(true);
};
$("btnClear").onclick = () => {
  editor.value = "";
  update(true);
};

// ── Canvas controls ──
modeSel.onchange = () => {
  relayout();
  renderContent();
  saveSession();
};
const applySpacing = debounce(() => {
  relayout();
  renderContent();
  saveSession();
}, 120);
$("spacing").oninput = applySpacing;
$<HTMLInputElement>("hubToggle").onchange = applyHubVisibility;
$<HTMLInputElement>("keyToggle").onchange = (e) => {
  state.hideNonKey = (e.target as HTMLInputElement).checked;
  (e.target as HTMLInputElement).closest(".chip")!.classList.toggle("act", state.hideNonKey);
  refresh();
};

// ── Domain / enum / filter panels ──
$("btnDomain").onclick = () => togglePanel("domainPanel");
$("btnEnum").onclick = () => togglePanel("enumPanel");
$("btnFilter").onclick = () => togglePanel("filterPanel");
$("dpAll").onclick = () => {
  state.model.groups.forEach((g) => state.activeGroups.add(g.id));
  buildDomainPanel();
  refresh();
};
$("dpNone").onclick = () => {
  state.activeGroups.clear();
  buildDomainPanel();
  refresh();
};
document.addEventListener("pointerdown", (e) => {
  const triggers: Record<string, string> = {
    domainPanel: "#btnDomain",
    enumPanel: "#btnEnum",
    filterPanel: "#btnFilter",
  };
  for (const p in triggers) {
    const el = $(p);
    if (el.classList.contains("show") && !el.contains(e.target as Node) && !(e.target as Element).closest(triggers[p]))
      el.classList.remove("show");
  }
});

// ── FK degree sliders ──
const applyRange = debounce(refresh, 150);
function bindRange(minId: string, maxId: string, key: "out" | "in"): void {
  const lo = $<HTMLInputElement>(minId),
    hi = $<HTMLInputElement>(maxId),
    lbl = $(key === "out" ? "fkOutLbl" : "fkInLbl");
  const sync = (movedLo: boolean) => {
    let a = +lo.value,
      b = +hi.value;
    // Keep the handles from crossing — whichever one moved pushes the other.
    if (a > b) {
      if (movedLo) hi.value = String((b = a));
      else lo.value = String((a = b));
    }
    state.filter[key === "out" ? "outMin" : "inMin"] = a;
    state.filter[key === "out" ? "outMax" : "inMax"] = b;
    lbl.textContent = `${a} – ${b}`;
    applyRange();
  };
  lo.addEventListener("input", () => sync(true));
  hi.addEventListener("input", () => sync(false));
}
bindRange("fkOutMin", "fkOutMax", "out");
bindRange("fkInMin", "fkInMax", "in");

$("filterReset").onclick = resetAllFilters;
document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => {
  b.onclick = () => applyPreset(b.dataset.preset as Preset);
});

// ── Inferred (soft) relationships ──
$<HTMLInputElement>("softToggle").onchange = (e) => {
  state.showSoft = (e.target as HTMLInputElement).checked;
  rebuildEdges();
  refresh();
};

// ── Audit ──
$<HTMLInputElement>("auditHide").onchange = (e) => {
  state.filter.hideDone = (e.target as HTMLInputElement).checked;
  refresh();
};
$("auditReset").onclick = () => {
  state.audit = {};
  renderContent();
  updateStat();
  saveSession();
};

// ── Focus chip: clear + hop radius ──
$("focusClear").onclick = () => {
  state.focusTable = null;
  applyFocus();
};
$("hopSeg").addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button[data-h]");
  if (!b) return;
  state.focusHops = +b.dataset.h!;
  applyFocus();
  saveSession();
});

// ── Editor pane resize handle ──
(function () {
  const h = $("handle"),
    pane = $("editorPane");
  let drag = false;
  h.addEventListener("pointerdown", (e) => {
    drag = true;
    h.setPointerCapture(e.pointerId);
  });
  h.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const br = $("body").getBoundingClientRect();
    const w = Math.max(200, Math.min(e.clientX - br.left, br.width - 340));
    pane.style.width = w + "px";
    fitView();
  });
  h.addEventListener("pointerup", () => (drag = false));
})();

window.addEventListener("resize", () => {
  if (state.model.tables.length) fitView();
});

// ── Boot ──
editor.value = loadLastSource() || SAMPLE;
buildShell();
update(true);
