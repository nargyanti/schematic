import "./style.css";
import { SAMPLE } from "./constants";
import { initExport } from "./export";
import { initIO } from "./io";
import { relayout } from "./layout";
import { buildDomainPanel, jumpTo, togglePanel, updateStat } from "./panels";
import { applyFocus, applyHubVisibility, buildShell, renderContent } from "./render";
import { state } from "./state";
import { update } from "./update";
import { fitView, initPanZoom, zoomBy } from "./view";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = $<HTMLTextAreaElement>("editor");
const modeSel = $<HTMLSelectElement>("mode");

// ── Pan / zoom ──
initPanZoom();
$("zIn").onclick = () => zoomBy(1.2);
$("zOut").onclick = () => zoomBy(1 / 1.2);
$("zReset").onclick = fitView;

// ── Search ──
$<HTMLInputElement>("search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") jumpTo((e.target as HTMLInputElement).value);
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
};
let sdeb: ReturnType<typeof setTimeout>;
$("spacing").oninput = () => {
  clearTimeout(sdeb);
  sdeb = setTimeout(() => {
    relayout();
    renderContent();
  }, 120);
};
$<HTMLInputElement>("hubToggle").onchange = applyHubVisibility;
$<HTMLInputElement>("keyToggle").onchange = (e) => {
  state.hideNonKey = (e.target as HTMLInputElement).checked;
  (e.target as HTMLInputElement).closest(".chip")!.classList.toggle("act", state.hideNonKey);
  relayout();
  renderContent();
};

// ── Domain / enum panels ──
$("btnDomain").onclick = () => togglePanel("domainPanel");
$("btnEnum").onclick = () => togglePanel("enumPanel");
$("dpAll").onclick = () => {
  state.model.groups.forEach((g) => state.activeGroups.add(g.id));
  buildDomainPanel();
  relayout();
  renderContent();
  updateStat();
};
$("dpNone").onclick = () => {
  state.activeGroups.clear();
  buildDomainPanel();
  relayout();
  renderContent();
  updateStat();
};
document.addEventListener("pointerdown", (e) => {
  ["domainPanel", "enumPanel"].forEach((p) => {
    const el = document.getElementById(p)!;
    const trigger = "#btn" + (p === "domainPanel" ? "Domain" : "Enum");
    if (el.classList.contains("show") && !el.contains(e.target as Node) && !(e.target as Element).closest(trigger))
      el.classList.remove("show");
  });
});

// ── Focus chip ──
$("focusChip").onclick = () => {
  state.focusTable = null;
  applyFocus();
};

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
  if (state.model.tables.filter((t) => state.activeGroups.has(t.group || "_")).length) fitView();
});

// ── Boot ──
editor.value = SAMPLE;
buildShell();
update(true);
