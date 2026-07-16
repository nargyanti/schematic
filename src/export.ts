import { jsPDF } from "jspdf";
import { edgeGeom, el, markEl, NS } from "./geometry";
import { layoutFlat, spacingVals } from "./layout";
import { makeTableEl } from "./render";
import { state } from "./state";
import type { Group } from "./types";
import { bbox } from "./view";
// Raw stylesheet text, embedded into exported SVG/PNG/PDF so they render standalone.
import cssText from "./style.css?inline";

// Trigger a browser download of a blob.
export function dl(name: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// Serialize the current on-screen content group to a standalone SVG string.
function contentSVGString(): { s: string; W: number; H: number } {
  const bb = bbox(),
    pad = 30,
    W = bb.w + pad * 2,
    H = bb.h + pad * 2;
  const c = document.getElementById("content")!.cloneNode(true) as Element;
  c.setAttribute("transform", `translate(${-bb.x + pad},${-bb.y + pad})`);
  return {
    s: `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f3f1ea"/><style>${cssText}</style>${new XMLSerializer().serializeToString(c)}</svg>`,
    W,
    H,
  };
}

function rasterizeString(s: string, W: number, H: number, scale: number): Promise<HTMLCanvasElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = Math.round(W * scale);
      cv.height = Math.round(H * scale);
      const cx = cv.getContext("2d")!;
      cx.fillStyle = "#f3f1ea";
      cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      res(cv);
    };
    img.onerror = rej;
    img.src = url;
  });
}

function pickScale(W: number): number {
  let s = 2;
  if (W * s > 4200) s = 4200 / W;
  return Math.max(1, s);
}

// ── A4 per-domain PDF export ──────────────────────────────────────────────
function domainSVGString(groupId: string): { s: string; W: number; H: number; count: number } {
  const tables = state.model.tables.filter((t) => (groupId === "_" ? true : t.group === groupId));
  const ns = new Set(tables.map((t) => t.name));
  const refs = state.model.refs.filter((r) => ns.has(r.from.table) && ns.has(r.to.table));
  const sp = spacingVals();
  const lay = layoutFlat(tables, refs, sp);
  const lp = lay.pos;
  const tmap: Record<string, (typeof tables)[number]> = {};
  tables.forEach((t) => (tmap[t.name] = t));
  const g = el("g");
  refs.forEach((r) => {
    const geom = edgeGeom(r, lp, tmap);
    if (!geom) return;
    g.appendChild(el("path", { d: geom.d }, "edge"));
    g.appendChild(markEl(geom.A, geom.aS, r.sym, "from"));
    g.appendChild(markEl(geom.B, geom.bS, r.sym, "to"));
  });
  tables.forEach((t) => g.appendChild(makeTableEl(t, lp[t.name] || { x: 0, y: 0 })));
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  tables.forEach((t) => {
    const p = lp[t.name];
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + t.width!);
    y1 = Math.max(y1, p.y + t.height!);
  });
  if (x0 > 1e8) {
    x0 = y0 = 0;
    x1 = y1 = 100;
  }
  const pad = 24,
    W = x1 - x0 + pad * 2,
    H = y1 - y0 + pad * 2;
  g.setAttribute("transform", `translate(${-x0 + pad},${-y0 + pad})`);
  return {
    s: `<svg xmlns="${NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><style>${cssText}</style>${new XMLSerializer().serializeToString(g)}</svg>`,
    W,
    H,
    count: tables.length,
  };
}

const a4opts = { orient: "auto", fit: "page", read: 80 };

function a4PageDims(o: string): { PW: number; PH: number } {
  return o === "portrait" ? { PW: 595.28, PH: 841.89 } : { PW: 841.89, PH: 595.28 };
}

function a4Orient(W: number, H: number, mode: string): "landscape" | "portrait" {
  if (mode === "landscape") return "landscape";
  if (mode === "portrait") return "portrait";
  const L = Math.min((841.89 - 64) / W, (595.28 - 88) / H),
    P = Math.min((595.28 - 64) / W, (841.89 - 88) / H);
  return P > L ? "portrait" : "landscape";
}

function a4Chrome(pdf: jsPDF, g: Group, count: number, PW: number, mL: number, mR: number, mT: number, sub: string): void {
  pdf.setFillColor(g.color);
  pdf.rect(mL, mT - 26, 7, 20, "F");
  pdf.setTextColor(20, 28, 44);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(g.title, mL + 14, mT - 11);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(130, 135, 153);
  let rt = count + " tables";
  if (sub) rt += "   ·   " + sub;
  pdf.text(rt, PW - mR, mT - 11, { align: "right" });
  pdf.setDrawColor(217, 213, 200);
  pdf.setLineWidth(0.5);
  pdf.line(mL, mT - 4, PW - mR, mT - 4);
}

function a4Footer(pdf: jsPDF, PW: number, PH: number, page: number, total: number): void {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(150, 155, 170);
  pdf.text(`Schematic · page ${page}/${total}`, PW / 2, PH - 12, { align: "center" });
}

async function exportA4(): Promise<void> {
  const busy = document.getElementById("busy")!;
  busy.classList.add("show");
  busy.textContent = "Preparing PDF…";
  await new Promise((r) => setTimeout(r, 30));
  try {
    const mL = 32,
      mR = 32,
      mT = 58,
      mB = 30;
    let doms: Group[] = state.model.groups.filter(
      (g) => state.activeGroups.has(g.id) && state.model.tables.some((t) => t.group === g.id)
    );
    if (!doms.length) doms = [{ id: "_", title: "ERD", color: "#2b3a5c" }];
    const built: Array<ReturnType<typeof domainSVGString> & {
      g: Group;
      orient: "landscape" | "portrait";
      PW: number;
      PH: number;
      cw: number;
      ch: number;
      cols: number;
      rows: number;
    }> = [];
    let total = 0;
    for (const g of doms) {
      const d = domainSVGString(g.id);
      const orient = a4Orient(d.W, d.H, a4opts.orient);
      const { PW, PH } = a4PageDims(orient);
      const cw = PW - mL - mR,
        ch = PH - mT - mB;
      let cols = 1,
        rows = 1;
      if (a4opts.fit === "tile") {
        const k = Math.max(0.45, a4opts.read / 100),
          twp = cw / k,
          thp = ch / k;
        cols = Math.max(1, Math.ceil(d.W / twp));
        rows = Math.max(1, Math.ceil(d.H / thp));
      }
      built.push({ g, ...d, orient, PW, PH, cw, ch, cols, rows });
      total += cols * rows;
    }
    let pdf: jsPDF | null = null,
      page = 0;
    const newPage = (o: "landscape" | "portrait") => {
      if (!pdf) pdf = new jsPDF({ orientation: o, unit: "pt", format: "a4" });
      else pdf.addPage("a4", o);
      page++;
    };
    for (const b of built) {
      const { g, s, W, H, count, orient, PW, PH, cw, ch, cols, rows } = b;
      busy.textContent = `Rendering ${g.title}…`;
      await new Promise((r) => setTimeout(r, 10));
      if (a4opts.fit === "page") {
        const cv = await rasterizeString(s, W, H, pickScale(W));
        newPage(orient);
        a4Chrome(pdf!, g, count, PW, mL, mR, mT, "");
        const fit = Math.min(cw / W, ch / H),
          dw = W * fit,
          dh = H * fit;
        pdf!.addImage(cv.toDataURL("image/png"), "PNG", mL + (cw - dw) / 2, mT + (ch - dh) / 2, dw, dh);
        a4Footer(pdf!, PW, PH, page, total);
      } else {
        const k = Math.max(0.45, a4opts.read / 100),
          twp = cw / k,
          thp = ch / k;
        let rs = 2;
        if (W * rs > 8000 || H * rs > 8000) rs = Math.max(1, Math.min(8000 / W, 8000 / H));
        const big = await rasterizeString(s, W, H, rs);
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const sx = c * twp,
              sy = r * thp,
              sw = Math.min(twp, W - sx),
              sh = Math.min(thp, H - sy);
            const tc = document.createElement("canvas");
            tc.width = Math.max(1, Math.round(sw * rs));
            tc.height = Math.max(1, Math.round(sh * rs));
            const cx = tc.getContext("2d")!;
            cx.fillStyle = "#fff";
            cx.fillRect(0, 0, tc.width, tc.height);
            cx.drawImage(big, Math.round(sx * rs), Math.round(sy * rs), Math.round(sw * rs), Math.round(sh * rs), 0, 0, tc.width, tc.height);
            newPage(orient);
            a4Chrome(pdf!, g, count, PW, mL, mR, mT, rows * cols > 1 ? `tile ${r + 1},${c + 1} of ${rows}×${cols}` : "");
            pdf!.addImage(tc.toDataURL("image/png"), "PNG", mL, mT, sw * k, sh * k);
            a4Footer(pdf!, PW, PH, page, total);
          }
      }
    }
    pdf!.save("schematic-erd-A4.pdf");
  } catch (e) {
    alert("A4 export failed: " + (e as Error).message);
    console.error(e);
  } finally {
    busy.classList.remove("show");
    busy.textContent = "Preparing PDF…";
  }
}

// Wire up all export buttons (SVG / PNG / PDF / A4 popover). Called once at startup.
export function initExport(): void {
  const hasTables = () => document.querySelectorAll(".grp").length > 0;

  document.getElementById("btnSvg")!.onclick = () => {
    if (!hasTables()) return;
    dl("erd.svg", new Blob([contentSVGString().s], { type: "image/svg+xml" }));
  };
  document.getElementById("btnPng")!.onclick = async () => {
    if (!hasTables()) return;
    const { s, W, H } = contentSVGString();
    const cv = await rasterizeString(s, W, H, pickScale(W));
    cv.toBlob((b) => dl("erd.png", b!), "image/png");
  };
  document.getElementById("btnPdf")!.onclick = async () => {
    if (!hasTables()) return;
    const { s, W, H } = contentSVGString();
    const cv = await rasterizeString(s, W, H, pickScale(W));
    const pdf = new jsPDF({ orientation: W >= H ? "l" : "p", unit: "pt", format: [W + 40, H + 40] });
    pdf.setFillColor(243, 241, 234);
    pdf.rect(0, 0, W + 40, H + 40, "F");
    pdf.addImage(cv.toDataURL("image/png"), "PNG", 20, 20, W, H);
    pdf.save("erd.pdf");
  };

  document.getElementById("btnA4")!.onclick = (e) => {
    e.stopPropagation();
    document.getElementById("a4Panel")!.classList.toggle("show");
  };
  document.getElementById("btnA4Go")!.onclick = () => {
    document.getElementById("a4Panel")!.classList.remove("show");
    exportA4();
  };
  document.querySelectorAll<HTMLElement>("#a4Panel .seg").forEach((seg) => {
    seg.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
      btn.onclick = () => {
        seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
        btn.classList.add("on");
        (a4opts as Record<string, string | number>)[seg.dataset.key!] = btn.dataset.val!;
        (document.getElementById("a4ReadRow") as HTMLElement).style.opacity = a4opts.fit === "tile" ? "1" : ".4";
      };
    });
  });
  (document.getElementById("a4Read") as HTMLInputElement).oninput = (e) => {
    a4opts.read = +(e.target as HTMLInputElement).value;
  };
  document.addEventListener("pointerdown", (e) => {
    const ap = document.getElementById("a4Panel")!;
    if (ap.classList.contains("show") && !ap.contains(e.target as Node) && !(e.target as Element).closest("#btnA4"))
      ap.classList.remove("show");
  });
}
