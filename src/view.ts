import { sizeTable } from "./geometry";
import { applyFocus, clearPath } from "./render";
import { state, visTables } from "./state";

/** Wired by main.ts: lets the minimap follow pan/zoom without view.ts importing it (it imports bbox from here). */
export const viewHooks = { changed: () => {} };

const svg = () => document.getElementById("svg") as unknown as SVGSVGElement;

// Bounding box of all visible tables + group boxes (world coordinates).
export function bbox(): { x: number; y: number; w: number; h: number } {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  visTables().forEach((t) => {
    const p = state.pos[t.name];
    if (!p) return;
    sizeTable(t);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + t.width!);
    y1 = Math.max(y1, p.y + t.height!);
  });
  for (const k in state.groupBoxAbs) {
    const b = state.groupBoxAbs[k];
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  if (x0 > 1e8) return { x: 0, y: 0, w: 100, h: 100 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function fitView(): void {
  const bb = bbox();
  const r = svg().getBoundingClientRect();
  const pad = 50;
  const s = Math.min((r.width - pad * 2) / bb.w, (r.height - pad * 2) / bb.h, 1.4);
  state.view.s = Math.max(0.05, s);
  state.view.x = (r.width - bb.w * state.view.s) / 2 - bb.x * state.view.s;
  state.view.y = (r.height - bb.h * state.view.s) / 2 - bb.y * state.view.s;
  applyView();
}

export function applyView(): void {
  const g = document.getElementById("viewport");
  if (g) g.setAttribute("transform", `translate(${state.view.x},${state.view.y}) scale(${state.view.s})`);
  document.getElementById("zLbl")!.textContent = Math.round(state.view.s * 100) + "%";
  viewHooks.changed();
}

export function zoomBy(f: number): void {
  const r = svg().getBoundingClientRect();
  const mx = r.width / 2,
    my = r.height / 2;
  const ns = Math.min(3, Math.max(0.05, state.view.s * f));
  state.view.x = mx - (mx - state.view.x) * (ns / state.view.s);
  state.view.y = my - (my - state.view.y) * (ns / state.view.s);
  state.view.s = ns;
  applyView();
}

// Pan (drag empty canvas) + zoom (wheel). Called once at startup.
export function initPanZoom(): void {
  const s = svg();
  let pan = false,
    sx = 0,
    sy = 0,
    ox = 0,
    oy = 0;
  s.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest(".grp")) return;
    // First click on empty canvas leaves path mode; the next one clears focus.
    if (!clearPath() && state.focusTable) {
      state.focusTable = null;
      applyFocus();
    }
    pan = true;
    s.classList.add("grabbing");
    sx = e.clientX;
    sy = e.clientY;
    ox = state.view.x;
    oy = state.view.y;
  });
  window.addEventListener("pointermove", (e) => {
    if (!pan) return;
    state.view.x = ox + (e.clientX - sx);
    state.view.y = oy + (e.clientY - sy);
    applyView();
  });
  window.addEventListener("pointerup", () => {
    pan = false;
    s.classList.remove("grabbing");
  });
  s.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = s.getBoundingClientRect();
      const mx = e.clientX - r.left,
        my = e.clientY - r.top;
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const ns = Math.min(3, Math.max(0.05, state.view.s * f));
      state.view.x = mx - (mx - state.view.x) * (ns / state.view.s);
      state.view.y = my - (my - state.view.y) * (ns / state.view.s);
      state.view.s = ns;
      applyView();
    },
    { passive: false }
  );
}
