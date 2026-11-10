// Minimap: a small canvas overlay showing every visible table (in its domain
// colour) and the current viewport. Click or drag on it to pan the main view.
//
// A <canvas>, not SVG: 300+ tables are 300+ fillRect calls instead of 300+ DOM
// nodes, and it sits outside #svg / #content so exports never contain it.

import { sizeTable } from "./geometry";
import { state, visTables } from "./state";
import { applyView, bbox } from "./view";

const W = 180;
const H = 120;
const PAD = 6;
const STORE_KEY = "schematic:minimap";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** World -> minimap mapping: screen = (world - origin) * k + offset. */
interface Map2D {
  bx: number;
  by: number;
  k: number;
  ox: number;
  oy: number;
}

/** Frozen for the duration of a drag: the bounds include the viewport, so a live mapping would slide under the cursor. */
let frozen: Map2D | null = null;
let raf = 0;
let enabled = true;

const canvas = () => $<HTMLCanvasElement>("minimapCv");
const svgBox = () => $("svg").getBoundingClientRect();

function viewportWorld(): { x: number; y: number; w: number; h: number } {
  const r = svgBox();
  const s = state.view.s;
  return { x: -state.view.x / s, y: -state.view.y / s, w: r.width / s, h: r.height / s };
}

function mapping(): Map2D {
  const bb = bbox();
  const vp = viewportWorld();
  // Union with the viewport so its rectangle stays on the map even when panned off the diagram.
  const x0 = Math.min(bb.x, vp.x),
    y0 = Math.min(bb.y, vp.y),
    x1 = Math.max(bb.x + bb.w, vp.x + vp.w),
    y1 = Math.max(bb.y + bb.h, vp.y + vp.h);
  const w = Math.max(1, x1 - x0),
    h = Math.max(1, y1 - y0);
  const k = Math.min((W - PAD * 2) / w, (H - PAD * 2) / h);
  return { bx: x0, by: y0, k, ox: (W - w * k) / 2, oy: (H - h * k) / 2 };
}

function draw(): void {
  raf = 0;
  if (!enabled) return;
  const cv = canvas();
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const tables = visTables();
  if (!tables.length) return;
  const m = frozen || mapping();
  const px = (x: number) => (x - m.bx) * m.k + m.ox,
    py = (y: number) => (y - m.by) * m.k + m.oy;

  // One lookup per group instead of one groups.find() per table.
  const colour: Record<string, string> = {};
  state.model.groups.forEach((g) => (colour[g.id] = g.color));
  for (const t of tables) {
    const p = state.pos[t.name];
    if (!p) continue;
    sizeTable(t);
    ctx.fillStyle = (t.group && colour[t.group]) || "#2b3a5c";
    // Never thinner than a pixel and a half, or small tables vanish on big schemas.
    ctx.fillRect(px(p.x), py(p.y), Math.max(1.5, t.width! * m.k), Math.max(1.5, t.height! * m.k));
  }
  const f = state.focusTable && state.pos[state.focusTable];
  if (f) {
    const t = state.tableByName[state.focusTable!];
    ctx.strokeStyle = "#3b5bdb";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px(f.x) - 1, py(f.y) - 1, Math.max(3, t.width! * m.k + 2), Math.max(3, t.height! * m.k + 2));
  }

  const vp = viewportWorld();
  ctx.fillStyle = "rgba(59,91,219,0.12)";
  ctx.strokeStyle = "#3b5bdb";
  ctx.lineWidth = 1.5;
  ctx.fillRect(px(vp.x), py(vp.y), vp.w * m.k, vp.h * m.k);
  ctx.strokeRect(px(vp.x), py(vp.y), vp.w * m.k, vp.h * m.k);
}

/** Redraw on the next animation frame; any number of calls per frame cost one draw. */
export function scheduleMinimap(): void {
  if (!enabled || raf) return;
  raf = requestAnimationFrame(draw);
}

/** Centre the main view on the world point under a pointer event. */
function panTo(e: PointerEvent): void {
  const m = frozen;
  if (!m) return;
  const r = canvas().getBoundingClientRect();
  const wx = (e.clientX - r.left - m.ox) / m.k + m.bx,
    wy = (e.clientY - r.top - m.oy) / m.k + m.by;
  const sb = svgBox();
  state.view.x = sb.width / 2 - wx * state.view.s;
  state.view.y = sb.height / 2 - wy * state.view.s;
  applyView(); // schedules the redraw
}

export function setMinimap(on: boolean): void {
  enabled = on;
  $("minimap").classList.toggle("hidden", !on);
  $("mapBtn").classList.toggle("bg-paper-line", on);
  try {
    localStorage.setItem(STORE_KEY, on ? "1" : "0");
  } catch {
    /* private mode — the toggle just won't be remembered */
  }
  if (on) scheduleMinimap();
}

export const toggleMinimap = () => setMinimap(!enabled);

export function initMinimap(): void {
  let on = true;
  try {
    on = localStorage.getItem(STORE_KEY) !== "0";
  } catch {
    /* default on */
  }
  const cv = canvas();
  cv.style.width = W + "px";
  cv.style.height = H + "px";
  cv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    frozen = mapping();
    cv.setPointerCapture(e.pointerId);
    panTo(e);
  });
  cv.addEventListener("pointermove", (e) => {
    if (frozen) panTo(e);
  });
  const end = () => {
    frozen = null;
    scheduleMinimap();
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  $("mapBtn").onclick = toggleMinimap;
  setMinimap(on);
}
