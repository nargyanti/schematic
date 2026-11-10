// Undo / redo for the arrangement of the diagram: table positions, collapsed
// tables, and the layout controls that produced them. Deliberately not for
// filters, audit marks or notes — those have their own panels and reset buttons.

import { hooks, renderContent } from "./render";
import { state, visTables } from "./state";
import type { GroupBox, Point } from "./types";

interface Snap {
  pos: Record<string, Point>;
  /** By-domain boxes are derived from a layout pass, so they are restored verbatim rather than recomputed. */
  boxes: Record<string, GroupBox>;
  collapsed: string[];
  mode: string;
  spacing: number;
}

const MAX = 50;
/** A density-slider gesture counts as finished after this much quiet. */
const GESTURE_MS = 500;

const undoStack: Snap[] = [];
const redoStack: Snap[] = [];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const modeSel = () => $<HTMLSelectElement>("mode");
const spacingEl = () => $<HTMLInputElement>("spacing");

// The select / slider have already changed by the time their event fires, so
// the previous values are remembered here for the snapshot taken then.
let lastMode = "domain";
let lastSpacing = 55;
let gestureTimer: ReturnType<typeof setTimeout> | undefined;

const copyPos = (p: Record<string, Point>) => {
  const o: Record<string, Point> = {};
  for (const k in p) o[k] = { x: p[k].x, y: p[k].y };
  return o;
};
const copyBoxes = (b: Record<string, GroupBox>) => {
  const o: Record<string, GroupBox> = {};
  for (const k in b) o[k] = { ...b[k] };
  return o;
};

function capture(over: Partial<Pick<Snap, "mode" | "spacing">> = {}): Snap {
  return {
    pos: copyPos(state.pos),
    boxes: copyBoxes(state.groupBoxAbs),
    collapsed: [...state.collapsed],
    mode: over.mode ?? modeSel().value,
    spacing: over.spacing ?? +spacingEl().value,
  };
}

function push(s: Snap): void {
  undoStack.push(s);
  if (undoStack.length > MAX) undoStack.shift();
  redoStack.length = 0; // a new edit forks history
  updateButtons();
}

/** Record the current arrangement as an undo step. Call BEFORE mutating. */
export function pushHistory(): void {
  push(capture());
}

/** Snapshot now, push later: for a drag, which only counts once the table really moves. */
export function captureForLater(): () => void {
  const s = capture();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    push(s);
  };
}

/** Layout mode changed (the select already shows the new value). */
export function modeChanged(): void {
  push(capture({ mode: lastMode }));
  lastMode = modeSel().value;
}

/** Density slider moved: one undo entry per gesture, holding the value before it started. */
export function spacingGesture(): void {
  if (!gestureTimer) push(capture({ spacing: lastSpacing }));
  clearTimeout(gestureTimer);
  gestureTimer = setTimeout(() => {
    gestureTimer = undefined;
    lastSpacing = +spacingEl().value;
  }, GESTURE_MS);
}

/** Forget everything — a fresh schema produced a fresh layout. */
export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  clearTimeout(gestureTimer);
  gestureTimer = undefined;
  lastMode = modeSel().value;
  lastSpacing = +spacingEl().value;
  updateButtons();
}

function restore(s: Snap): void {
  modeSel().value = s.mode;
  spacingEl().value = String(s.spacing);
  lastMode = s.mode;
  lastSpacing = s.spacing;
  clearTimeout(gestureTimer);
  gestureTimer = undefined;

  const pos = copyPos(s.pos);
  // Tables that became visible after the snapshot (a filter changed since) keep
  // their current spot instead of collapsing onto the origin.
  for (const t of visTables()) if (!pos[t.name] && state.pos[t.name]) pos[t.name] = { ...state.pos[t.name] };
  state.pos = pos;
  state.groupBoxAbs = copyBoxes(s.boxes);
  state.collapsed = new Set(s.collapsed);
  renderContent();
  hooks.layoutChanged(); // persist
  updateButtons();
}

export function undo(): void {
  const s = undoStack.pop();
  if (!s) return;
  redoStack.push(capture());
  restore(s);
}

export function redo(): void {
  const s = redoStack.pop();
  if (!s) return;
  undoStack.push(capture());
  restore(s);
}

function updateButtons(): void {
  const u = document.getElementById("undoBtn") as HTMLButtonElement | null,
    r = document.getElementById("redoBtn") as HTMLButtonElement | null;
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}

export function initHistory(): void {
  $("undoBtn").onclick = undo;
  $("redoBtn").onclick = redo;
  clearHistory();
}
