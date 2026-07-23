// Session persistence: the same snapshot shape backs both the downloadable
// layout JSON and the automatic localStorage save, so a session survives a
// refresh without the user remembering to export anything.

import { buildDomainPanel, buildFilterPanel } from "./panels";
import { state } from "./state";
import type { AuditMark } from "./state";
import type { Role } from "./types";

const PREFIX = "schematic:v2:";
const LAST_KEY = PREFIX + "last";
/** Schemas above this size aren't cached — localStorage is only ~5 MB. */
const MAX_SRC = 1_000_000;

export interface Snapshot {
  v: 2;
  pos: Record<string, { x: number; y: number }>;
  collapsed: string[];
  activeGroups: string[];
  mode: string;
  spacing: number;
  hideNonKey: boolean;
  filter: {
    outMin: number;
    outMax: number;
    inMin: number;
    inMax: number;
    roles: Role[];
    hideDone: boolean;
  };
  audit: Record<string, AuditMark>;
  showSoft: boolean;
  softOff: string[];
  focusHops: number;
  view: { x: number; y: number; s: number };
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function snapshot(): Snapshot {
  return {
    v: 2,
    pos: state.pos,
    collapsed: [...state.collapsed],
    activeGroups: [...state.activeGroups],
    mode: $<HTMLSelectElement>("mode").value,
    spacing: +$<HTMLInputElement>("spacing").value,
    hideNonKey: state.hideNonKey,
    filter: {
      outMin: state.filter.outMin,
      outMax: state.filter.outMax,
      inMin: state.filter.inMin,
      inMax: state.filter.inMax,
      roles: [...state.filter.roles],
      hideDone: state.filter.hideDone,
    },
    audit: { ...state.audit },
    showSoft: state.showSoft,
    softOff: [...state.softOff],
    focusHops: state.focusHops,
    view: { ...state.view },
  };
}

export interface RestoredView {
  pos: Record<string, { x: number; y: number }> | null;
  view: { x: number; y: number; s: number } | null;
}

/**
 * Restore a snapshot onto current state. Positions and viewport are returned
 * rather than applied: the caller must lay out first (group boxes are derived
 * from a layout pass) and only then overlay the saved coordinates.
 */
export function applySnapshot(d: Partial<Snapshot>): RestoredView {
  if (d.mode) $<HTMLSelectElement>("mode").value = d.mode;
  if (d.spacing) $<HTMLInputElement>("spacing").value = String(d.spacing);
  if (typeof d.hideNonKey === "boolean") {
    state.hideNonKey = d.hideNonKey;
    const kt = $<HTMLInputElement>("keyToggle");
    kt.checked = state.hideNonKey;
    kt.closest(".chip")!.classList.toggle("act", state.hideNonKey);
  }
  if (d.activeGroups) {
    state.activeGroups = new Set(d.activeGroups);
    buildDomainPanel();
  }
  state.collapsed.clear();
  (d.collapsed || []).forEach((n) => state.collapsed.add(n));

  if (d.filter) {
    const f = d.filter;
    if (typeof f.outMin === "number") state.filter.outMin = f.outMin;
    if (typeof f.outMax === "number") state.filter.outMax = f.outMax;
    if (typeof f.inMin === "number") state.filter.inMin = f.inMin;
    if (typeof f.inMax === "number") state.filter.inMax = f.inMax;
    if (Array.isArray(f.roles)) state.filter.roles = new Set(f.roles);
    if (typeof f.hideDone === "boolean") state.filter.hideDone = f.hideDone;
  }
  if (d.audit) state.audit = { ...d.audit };
  if (typeof d.showSoft === "boolean") state.showSoft = d.showSoft;
  if (d.softOff) state.softOff = new Set(d.softOff);
  if (typeof d.focusHops === "number") state.focusHops = Math.min(3, Math.max(1, d.focusHops));
  buildFilterPanel();

  const hasPos = !!d.pos && Object.keys(d.pos).length > 0;
  return { pos: hasPos ? d.pos! : null, view: hasPos && d.view ? d.view : null };
}

/** Stable 32-bit FNV-1a hash — keys a session to the exact schema text. */
export function hashSource(src: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let currentHash = "";

export function setCurrentSchema(src: string): void {
  currentHash = hashSource(src);
  if (src.length <= MAX_SRC) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ hash: currentHash, src }));
    } catch {
      /* quota exceeded — session caching is best-effort */
    }
  }
}

export function saveSession(): void {
  if (!currentHash) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(PREFIX + currentHash, JSON.stringify(snapshot()));
    } catch {
      /* quota exceeded — session caching is best-effort */
    }
  }, 400);
}

export function loadSession(src: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(PREFIX + hashSource(src));
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

/** The schema text from the previous visit, if it still fits in storage. */
export function loadLastSource(): string | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { src?: string };
    return typeof d.src === "string" && d.src.trim() ? d.src : null;
  } catch {
    return null;
  }
}
