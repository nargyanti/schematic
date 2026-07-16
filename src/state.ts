import type { Model, Point, GroupBox, Table } from "./types";

// Central mutable app state. Modules read/mutate through this object so that
// reassignable values (model, pos, activeGroups, …) stay in sync across modules.
export const state = {
  model: { tables: [], refs: [], groups: [], enums: {} } as Model,
  pos: {} as Record<string, Point>,
  groupBoxAbs: {} as Record<string, GroupBox>,
  view: { x: 60, y: 60, s: 1 },
  activeGroups: new Set<string>(),
  hubSet: new Set<string>(),
  focusTable: null as string | null,
  hideNonKey: false,
  collapsed: new Set<string>(),
  tableByName: {} as Record<string, Table>,
};

export function indexTables(): void {
  for (const k in state.tableByName) delete state.tableByName[k];
  state.model.tables.forEach((t) => (state.tableByName[t.name] = t));
}

export function tableGroup(name: string): string | null {
  const t = state.tableByName[name];
  return t ? t.group : null;
}

export function visTables(): Table[] {
  return state.model.tables.filter((t) => state.activeGroups.has(t.group || "_"));
}

export function visRefs() {
  const s = new Set(visTables().map((t) => t.name));
  return state.model.refs.filter((r) => s.has(r.from.table) && s.has(r.to.table));
}

export function computeHubs(): void {
  const deg: Record<string, number> = {};
  state.model.refs.forEach((r) => {
    deg[r.to.table] = (deg[r.to.table] || 0) + 1;
    deg[r.from.table] = (deg[r.from.table] || 0) + 1;
  });
  state.hubSet = new Set(Object.keys(deg).filter((k) => deg[k] >= 8));
}

export function isHubEdge(r: { to: { table: string }; from: { table: string } }): boolean {
  return state.hubSet.has(r.to.table) || state.hubSet.has(r.from.table);
}
