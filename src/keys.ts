// Global keyboard shortcuts + the "?" help overlay.
//
// Every shortcut is one entry in SHORTCUTS: the combos that trigger it, a help
// label, and the action. The key->action lookup and the help text are both
// generated from that list, so adding a key (or a modified combo such as
// "ctrl+z" / "ctrl+y" for undo) is a single new entry and nothing else.

import { redo, undo } from "./history";
import { toggleMinimap } from "./minimap";
import { closeNoteEditor, isNoteEditorOpen, openNoteEditor } from "./notes";
import { applyFocus, clearPath, setAuditMark, setFocusDir, setFocusHops } from "./render";
import { state, type AuditMark } from "./state";
import { openTableList } from "./tableList";
import { fitView } from "./view";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface Shortcut {
  /** Combos as built by comboOf(): lowercase key, optional "ctrl+" / "alt+" prefix. */
  keys: string[];
  /** How the keys are shown in the help overlay. */
  label: string;
  help: string;
  run: () => void;
}

/** Run `fn` only while a table is focused — the keys below act on that table. */
const onFocused = (fn: (table: string) => void) => () => {
  if (state.focusTable) fn(state.focusTable);
};
const mark = (m: AuditMark | undefined) => onFocused((t) => setAuditMark(t, m));

const openPanels = () => document.querySelectorAll<HTMLElement>(".panel.show, .a4pop.show");
const helpOpen = () => !$("helpOverlay").classList.contains("hidden");

export function toggleHelp(force?: boolean): void {
  const show = force ?? !helpOpen();
  $("helpOverlay").classList.toggle("hidden", !show);
  $("helpOverlay").classList.toggle("flex", show);
}

/** Esc peels back one layer: note editor, panels, help, path finder, then focus. */
function escape(): void {
  if (isNoteEditorOpen()) return closeNoteEditor();
  const panels = openPanels();
  if (panels.length) return panels.forEach((p) => p.classList.remove("show"));
  if (helpOpen()) return toggleHelp(false);
  if (clearPath()) return;
  if (state.focusTable) {
    state.focusTable = null;
    applyFocus();
  }
}

function focusSearch(): void {
  const box = $<HTMLInputElement>("search");
  box.focus();
  box.select();
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["/"], label: "/", help: "Search", run: focusSearch },
  { keys: ["escape"], label: "Esc", help: "Close editor / panels / help, then clear path, then clear focus", run: escape },
  { keys: ["1"], label: "1", help: "Focus radius: 1 hop", run: onFocused(() => setFocusHops(1)) },
  { keys: ["2"], label: "2", help: "Focus radius: 2 hops", run: onFocused(() => setFocusHops(2)) },
  { keys: ["3"], label: "3", help: "Focus radius: 3 hops", run: onFocused(() => setFocusHops(3)) },
  { keys: ["["], label: "[", help: "Focus ancestors (tables it references)", run: onFocused(() => setFocusDir("up")) },
  { keys: ["]"], label: "]", help: "Focus descendants (tables referencing it)", run: onFocused(() => setFocusDir("down")) },
  { keys: ["\\"], label: "\\", help: "Focus both directions", run: onFocused(() => setFocusDir("both")) },
  { keys: ["d"], label: "d", help: "Mark focused table done", run: mark("done") },
  { keys: ["w"], label: "w", help: "Mark focused table needs checking", run: mark("warn") },
  { keys: ["s"], label: "s", help: "Mark focused table ignore", run: mark("skip") },
  { keys: ["u"], label: "u", help: "Clear the focused table's mark", run: mark(undefined) },
  { keys: ["n"], label: "n", help: "Audit note for focused table", run: onFocused(() => openNoteEditor()) },
  { keys: ["k"], label: "k", help: "Toggle Keys (PK/FK columns only)", run: () => $("keyToggle").click() },
  { keys: ["h"], label: "h", help: "Toggle Hubs (fade hub edges)", run: () => $("hubToggle").click() },
  { keys: ["f"], label: "f", help: "Fit view", run: fitView },
  { keys: ["m"], label: "m", help: "Toggle the minimap", run: toggleMinimap },
  { keys: ["t"], label: "t", help: "Open the table list and filter it", run: openTableList },
  { keys: ["ctrl+z"], label: "Ctrl+Z", help: "Undo table positions / layout", run: undo },
  { keys: ["ctrl+shift+z", "ctrl+y"], label: "Ctrl+Shift+Z / Ctrl+Y", help: "Redo", run: redo },
  { keys: ["?"], label: "?", help: "This help", run: () => toggleHelp() },
];

/** Mouse gestures: documentation only, they are handled where the canvas is wired. */
const GESTURES: Array<[string, string]> = [
  ["Click table", "Focus it (click again or the empty canvas to clear)"],
  ["Shift+click table", "With a table focused: show the shortest path to this one (Esc / empty canvas to leave)"],
  ["Click / drag minimap", "Pan the main view there"],
  ["Double-click table", "Collapse / expand columns"],
  ["Right-click table", "Cycle audit mark: done, check, ignore, none"],
  ["Alt+click column", "Strike / unstrike the column (unused)"],
  ["Drag table / canvas", "Move the table / pan"],
  ["Scroll", "Zoom"],
];

const BY_COMBO = new Map<string, Shortcut>();
SHORTCUTS.forEach((s) => s.keys.forEach((k) => BY_COMBO.set(k, s)));

/**
 * Normalised combo for an event. Shift is left out on purpose for plain keys
 * ("?" already encodes it), but kept for Ctrl combos: Ctrl+Z and Ctrl+Shift+Z
 * are different shortcuts.
 */
function comboOf(e: KeyboardEvent): string {
  const ctrl = e.ctrlKey || e.metaKey;
  return (ctrl ? "ctrl+" : "") + (ctrl && e.shiftKey ? "shift+" : "") + (e.altKey ? "alt+" : "") + e.key.toLowerCase();
}

/** True while the user is typing, so shortcuts must not steal those keystrokes. */
function typingTarget(t: EventTarget | null): boolean {
  const e = t as HTMLElement | null;
  if (!e) return false;
  if (e.isContentEditable || e.tagName === "TEXTAREA" || e.tagName === "SELECT") return true;
  // Checkboxes, ranges and buttons keep focus after a click but take no text.
  return e.tagName === "INPUT" && !["checkbox", "radio", "range", "button"].includes((e as HTMLInputElement).type);
}

function buildHelp(): void {
  const rows = (items: Array<[string, string]>) =>
    items
      .map(
        ([k, d]) =>
          `<kbd class="justify-self-start whitespace-nowrap rounded border border-paper-line bg-[#f4f5f9] px-1.5 py-px font-mono text-[11px]">${k}</kbd><span>${d}</span>`
      )
      .join("");
  $("helpBody").innerHTML =
    rows(SHORTCUTS.map((s) => [s.label, s.help] as [string, string])) +
    `<div class="col-span-2 mt-2 font-mono text-[10.5px] uppercase tracking-[.06em] text-[#98a0b6]">Mouse</div>` +
    rows(GESTURES);
}

export function initKeys(): void {
  buildHelp();
  $("helpBtn").onclick = () => toggleHelp();
  $("helpClose").onclick = () => toggleHelp(false);
  $("helpOverlay").addEventListener("pointerdown", (e) => {
    if (e.target === $("helpOverlay")) toggleHelp(false);
  });

  document.addEventListener("keydown", (e) => {
    // Esc inside the search box and the note editor is handled by their own listeners.
    if (typingTarget(e.target) || e.repeat) return;
    const s = BY_COMBO.get(comboOf(e));
    if (!s) return;
    e.preventDefault();
    s.run();
  });
}
