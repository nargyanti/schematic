import { dl } from "./export";
import { relayout } from "./layout";
import { updateFilterBadge, updateStat } from "./panels";
import { applySnapshot, snapshot } from "./persist";
import { renderContent } from "./render";
import { state } from "./state";
import { update } from "./update";
import { applyView, fitView } from "./view";

// Save/load the session snapshot as JSON, and open/drop .dbml files.
// (The same snapshot is also written to localStorage automatically — this is
// the portable copy, for moving a session between machines.)
export function initIO(): void {
  const editor = document.getElementById("editor") as HTMLTextAreaElement;

  // ── Save layout ──
  document.getElementById("btnSaveLayout")!.onclick = () => {
    dl("erd-layout.json", new Blob([JSON.stringify(snapshot())], { type: "application/json" }));
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
        const restored = applySnapshot(JSON.parse(rd.result as string));
        relayout();
        if (restored.pos) Object.assign(state.pos, restored.pos);
        renderContent();
        updateStat();
        updateFilterBadge();
        if (restored.view) {
          Object.assign(state.view, restored.view);
          applyView();
        } else fitView();
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
