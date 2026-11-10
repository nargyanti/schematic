// Inline editor for the per-table audit note. A note is the reviewer's own
// remark ("FK missing", "dead since 2022") — separate from the DBML `note:`.

import { hooks } from "./render";
import { state } from "./state";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Table the editor is currently open for, or null when closed. */
let editing: string | null = null;

export const isNoteEditorOpen = () => editing !== null;

/** Open the editor for the focused table (no-op without a focus). */
export function openNoteEditor(): void {
  const name = state.focusTable;
  if (!name) return;
  editing = name;
  $("noteTable").textContent = name;
  const box = $<HTMLTextAreaElement>("noteText");
  box.value = state.auditNotes[name] || "";
  const ed = $("noteEditor");
  ed.classList.remove("hidden");
  ed.classList.add("flex");
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}

export function closeNoteEditor(): void {
  editing = null;
  const ed = $("noteEditor");
  ed.classList.add("hidden");
  ed.classList.remove("flex");
  // Hand the keyboard back to the canvas so single-key shortcuts work again.
  $<HTMLTextAreaElement>("noteText").blur();
}

/** Store the note (an empty one deletes it) and redraw the header marker. */
function save(): void {
  if (editing === null) return;
  const text = $<HTMLTextAreaElement>("noteText").value.trim();
  if (text) state.auditNotes[editing] = text;
  else delete state.auditNotes[editing];
  closeNoteEditor();
  hooks.auditChanged();
}

function remove(): void {
  if (editing === null) return;
  delete state.auditNotes[editing];
  closeNoteEditor();
  hooks.auditChanged();
}

export function initNotes(): void {
  $("noteBtn").onclick = () => (isNoteEditorOpen() ? closeNoteEditor() : openNoteEditor());
  $("noteSave").onclick = save;
  $("noteDelete").onclick = remove;
  $("noteText").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeNoteEditor();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  });
  // The editor belongs to one table: close it if focus moves elsewhere.
  hooks.focusChanged = () => {
    if (editing !== null && editing !== state.focusTable) closeNoteEditor();
  };
}
