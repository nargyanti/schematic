import { sizeTable } from "./geometry";
import { relayout } from "./layout";
import { applyFocus, renderContent } from "./render";
import { state, visRefs, visTables } from "./state";
import { applyView } from "./view";

const svg = () => document.getElementById("svg") as unknown as SVGSVGElement;

// Domain (group) toggle panel — one checkbox per domain.
export function buildDomainPanel(): void {
  const list = document.getElementById("dpList")!;
  list.innerHTML = "";
  const btn = document.getElementById("btnDomain")!;
  if (state.model.groups.length === 0) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "";
  state.model.groups.forEach((g) => {
    const cnt = state.model.tables.filter((t) => t.group === g.id).length;
    const row = document.createElement("label");
    row.className = "dRow";
    row.innerHTML = `<input type="checkbox" ${state.activeGroups.has(g.id) ? "checked" : ""}><span class="sw" style="background:${g.color}"></span><span>${g.title}</span><span class="cnt">${cnt}</span>`;
    row.querySelector("input")!.addEventListener("change", (e) => {
      if ((e.target as HTMLInputElement).checked) state.activeGroups.add(g.id);
      else state.activeGroups.delete(g.id);
      relayout();
      renderContent();
      updateStat();
    });
    list.appendChild(row);
  });
}

// Read-only list of enums declared in the schema.
export function buildEnumPanel(): void {
  const list = document.getElementById("enumList")!,
    btn = document.getElementById("btnEnum")!,
    names = Object.keys(state.model.enums);
  if (!names.length) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "";
  list.innerHTML = "";
  names.forEach((n) => {
    const row = document.createElement("div");
    row.className = "eRow";
    row.innerHTML = `<b>${n}</b><br><span>${state.model.enums[n].join(" · ")}</span>`;
    list.appendChild(row);
  });
}

export function updateStat(): void {
  document.getElementById("stat")!.textContent = `${visTables().length}/${state.model.tables.length} tables · ${visRefs().length} relations`;
}

export function togglePanel(id: string): void {
  ["domainPanel", "enumPanel"].forEach((p) => {
    if (p === id) document.getElementById(p)!.classList.toggle("show");
    else document.getElementById(p)!.classList.remove("show");
  });
}

// Center + focus a table by name (search box).
export function jumpTo(q: string): void {
  q = q.trim().toLowerCase();
  if (!q) return;
  const t =
    state.model.tables.find((x) => x.name.toLowerCase() === q) ||
    state.model.tables.find((x) => x.name.toLowerCase().includes(q));
  if (!t) return;
  if (!state.activeGroups.has(t.group || "_")) {
    state.activeGroups.add(t.group || "_");
    buildDomainPanel();
    relayout();
    renderContent();
    updateStat();
  }
  const p = state.pos[t.name];
  if (!p) return;
  sizeTable(t);
  const r = svg().getBoundingClientRect();
  state.view.s = 0.95;
  state.view.x = r.width / 2 - (p.x + t.width! / 2) * state.view.s;
  state.view.y = r.height / 2 - (p.y + t.height! / 2) * state.view.s;
  applyView();
  state.focusTable = t.name;
  applyFocus();
}
