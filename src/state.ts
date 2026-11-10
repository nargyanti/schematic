import { computeMetrics, inferSoftRefs, refEnds, softRefKey } from "./metrics";
import type { GroupBox, Model, Point, Ref, Role, Table, TableMetric } from "./types";

export type AuditMark = "done" | "warn" | "skip";

/** Which way the focus radius walks: toward parents, toward children, or both. */
export type FocusDir = "both" | "down" | "up";

export interface FilterState {
  outMin: number;
  outMax: number;
  inMin: number;
  inMax: number;
  roles: Set<Role>;
  hideDone: boolean;
}

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
  /** Focus radius in relationship hops (1–3). */
  focusHops: 1,
  /** "up" = ancestors (tables this one references), "down" = descendants. */
  focusDir: "both" as FocusDir,
  /** Path finder target: while set (and a table is focused) the canvas shows the shortest path focusTable → pathTo. */
  pathTo: null as string | null,
  hideNonKey: false,
  collapsed: new Set<string>(),
  tableByName: {} as Record<string, Table>,

  // ── FK metrics + filtering ──
  metrics: {} as Record<string, TableMetric>,
  maxOut: 0,
  maxIn: 0,
  roleCount: { master: 0, trx: 0, pivot: 0, orphan: 0 } as Record<Role, number>,
  filter: {
    outMin: 0,
    outMax: Infinity,
    inMin: 0,
    inMax: Infinity,
    roles: new Set<Role>(["master", "trx", "pivot", "orphan"]),
    hideDone: false,
  } as FilterState,

  // ── Inferred (soft) relationships ──
  softRefs: [] as Ref[],
  showSoft: false,
  /** Soft refs the user rejected, by softRefKey(). */
  softOff: new Set<string>(),

  // ── Audit marks ──
  audit: {} as Record<string, AuditMark>,
  /** Free-text audit note per table name (distinct from the DBML `note:`). */
  auditNotes: {} as Record<string, string>,
  /** Columns marked unused/ignored, keyed "table.column". */
  struck: new Set<string>(),

  /** Lowercased search term; highlights matching column rows. */
  colQuery: "",

  /** Real refs plus enabled soft refs — the array edges index into. */
  edges: [] as Ref[],
};

export function indexTables(): void {
  for (const k in state.tableByName) delete state.tableByName[k];
  state.model.tables.forEach((t) => (state.tableByName[t.name] = t));
}

export function tableGroup(name: string): string | null {
  const t = state.tableByName[name];
  return t ? t.group : null;
}

/** Recompute soft refs + degree metrics. Call after every re-parse. */
export function computeGraph(): void {
  state.softRefs = inferSoftRefs(state.model);
  const m = computeMetrics(state.model, activeSoftRefs());
  state.metrics = m.byTable;
  state.maxOut = m.maxOut;
  state.maxIn = m.maxIn;
  state.roleCount = m.roleCount;
}

export function activeSoftRefs(): Ref[] {
  return state.softRefs.filter((r) => !state.softOff.has(softRefKey(r)));
}

/** Rebuild the edge array that rendering indexes into. */
export function rebuildEdges(): void {
  state.edges = state.showSoft ? state.model.refs.concat(activeSoftRefs()) : state.model.refs.slice();
}

export function metricOf(name: string): TableMetric {
  return state.metrics[name] || { out: 0, in: 0, softIn: 0, role: "orphan" };
}

/** Reset FK ranges to span the whole schema. */
export function resetFilter(): void {
  state.filter.outMin = 0;
  state.filter.outMax = state.maxOut;
  state.filter.inMin = 0;
  state.filter.inMax = state.maxIn;
  state.filter.roles = new Set<Role>(["master", "trx", "pivot", "orphan"]);
  state.filter.hideDone = false;
}

/** True when a table survives every filter except the domain toggles. */
export function passesFilter(t: Table): boolean {
  const f = state.filter;
  const m = metricOf(t.name);
  if (!f.roles.has(m.role)) return false;
  if (m.out < f.outMin || m.out > f.outMax) return false;
  if (m.in < f.inMin || m.in > f.inMax) return false;
  if (f.hideDone && state.audit[t.name] === "done") return false;
  return true;
}

export function filterActive(): boolean {
  const f = state.filter;
  return (
    f.roles.size < 4 ||
    f.outMin > 0 ||
    f.outMax < state.maxOut ||
    f.inMin > 0 ||
    f.inMax < state.maxIn ||
    f.hideDone
  );
}

export function visTables(): Table[] {
  return state.model.tables.filter((t) => state.activeGroups.has(t.group || "_") && passesFilter(t));
}

export function visRefs(): Ref[] {
  const s = new Set(visTables().map((t) => t.name));
  return state.edges.filter((r) => s.has(r.from.table) && s.has(r.to.table));
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

/** Key for a struck column in `state.struck`. */
export const struckKey = (table: string, col: string) => table + "." + col;

export interface FocusScope {
  tables: Set<string>;
  /** Indexes into state.edges of the edges to keep lit. */
  edges: Set<number>;
}

/**
 * Which way a ref points, as [from-table-side, to-table-side] steps.
 *
 * Parser convention (verified in parser.ts + metrics.ts refEnds): for
 * `posts.author_id > users.id`, `from` = posts (the FK owner / child) and
 * `to` = users (the referenced parent). `<` flips it (`to` owns the FK), `-`
 * is treated like `>` (from owns the FK), and `<>` makes each side the child
 * of the other, so it is walkable in both directions. Inferred refs are `>`.
 * "down" = parent → child (descendants), "up" = child → parent (ancestors).
 */
function steps(r: Ref, dir: FocusDir): Array<[string, string]> {
  if (dir === "both") return [[r.from.table, r.to.table], [r.to.table, r.from.table]];
  const out: Array<[string, string]> = [];
  for (const { child, parent } of refEnds(r))
    out.push(dir === "down" ? [parent.table, child.table] : [child.table, parent.table]);
  return out;
}

/**
 * Tables within `hops` steps of `name` (including itself) and the edges to
 * light. In "both" mode an edge lights when both ends are in the set, so hops
 * 2–3 show a connected sub-graph. In a directional mode only edges actually
 * walked in that direction light — sibling↔sibling edges whose ends merely
 * happen to be in the set stay dim, otherwise "descendants" would show lines
 * running back up to other parents.
 */
export function focusScope(name: string, hops: number, dir: FocusDir = "both"): FocusScope {
  const adj: Record<string, string[]> = {};
  state.edges.forEach((r) => {
    for (const [a, b] of steps(r, dir)) (adj[a] ||= []).push(b);
  });
  const depth = new Map<string, number>([[name, 0]]);
  let frontier = [name];
  for (let h = 1; h <= hops && frontier.length; h++) {
    const next: string[] = [];
    for (const n of frontier)
      for (const m of adj[n] || [])
        if (!depth.has(m)) {
          depth.set(m, h);
          next.push(m);
        }
    frontier = next;
  }
  const tables = new Set(depth.keys());
  const edges = new Set<number>();
  state.edges.forEach((r, i) => {
    if (dir === "both") {
      if (tables.has(r.from.table) && tables.has(r.to.table)) edges.add(i);
      return;
    }
    // Walked = a step leaves a table that was expanded (depth < hops).
    for (const [a, b] of steps(r, dir)) {
      const d = depth.get(a);
      if (d !== undefined && d < hops && tables.has(b)) edges.add(i);
    }
  });
  return { tables, edges };
}

/** Tables within `hops` relationship steps of `name`, including itself. */
export function neighborhood(name: string, hops: number, dir: FocusDir = "both"): Set<string> {
  return focusScope(name, hops, dir).tables;
}
