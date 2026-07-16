import { dl } from "./export";
import { buildDomainPanel } from "./panels";
import { renderContent } from "./render";
import { state } from "./state";
import { update } from "./update";
import { fitView } from "./view";

// Save/load table positions + view options as JSON, and open/drop .dbml files.
export function initIO(): void {
  const editor = document.getElementById("editor") as HTMLTextAreaElement;
  const spacing = document.getElementById("spacing") as HTMLInputElement;
  const modeSel = document.getElementById("mode") as HTMLSelectElement;

  // ── Save layout ──
  document.getElementById("btnSaveLayout")!.onclick = () => {
    const data = {
      v: 1,
      pos: state.pos,
      collapsed: [...state.collapsed],
      activeGroups: [...state.activeGroups],
      mode: modeSel.value,
      spacing: +spacing.value,
      hideNonKey: state.hideNonKey,
    };
    dl("erd-layout.json", new Blob([JSON.stringify(data)], { type: "application/json" }));
  };

  // ── Load layout ──
  document.getElementById("btnLoadLayout")!.onclick = () =>
    (document.getElementById("fileLayout") as HTMLInputElement).click();
  document.getElementById("fileLayout")!.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result as string);
        if (d.mode) modeSel.value = d.mode;
        if (d.spacing) spacing.value = d.spacing;
        if (typeof d.hideNonKey === "boolean") {
          state.hideNonKey = d.hideNonKey;
          (document.getElementById("keyToggle") as HTMLInputElement).checked = state.hideNonKey;
        }
        if (d.activeGroups) {
          state.activeGroups = new Set(d.activeGroups);
          buildDomainPanel();
        }
        state.collapsed.clear();
        (d.collapsed || []).forEach((n: string) => state.collapsed.add(n));
        if (d.pos) state.pos = { ...state.pos, ...d.pos };
        renderContent();
        fitView();
      } catch (err) {
        alert("Invalid layout file: " + (err as Error).message);
      }
    };
    rd.readAsText(f);
    (e.target as HTMLInputElement).value = "";
  });

  // ── Open .dbml file ──
  document.getElementById("btnOpen")!.onclick = () =>
    (document.getElementById("fileDbml") as HTMLInputElement).click();
  document.getElementById("fileDbml")!.addEventListener("change", (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      editor.value = rd.result as string;
      update(true);
    };
    rd.readAsText(f);
    (e.target as HTMLInputElement).value = "";
  });

  // ── Drag & drop onto the editor ──
  editor.addEventListener("dragover", (e) => e.preventDefault());
  editor.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) {
      const rd = new FileReader();
      rd.onload = () => {
        editor.value = rd.result as string;
        update(true);
      };
      rd.readAsText(f);
    }
  });
}
