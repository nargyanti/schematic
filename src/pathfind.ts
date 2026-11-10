// Shortest relationship path between two tables (pure: edges in, path out).

import type { Ref } from "./types";

export interface TablePath {
  /** Table names from start to end, inclusive. */
  tables: string[];
  /** Indexes into the `edges` array that were walked, in order. */
  edges: number[];
}

/**
 * Breadth-first search, ignoring edge direction: for "how does A relate to B"
 * a child→parent hop and a parent→child hop are equally a hop. `allowed`
 * restricts the walk to drawn tables so the path never runs through a hidden
 * one. Returns null when the tables are not connected.
 */
export function findPath(edges: Ref[], from: string, to: string, allowed?: Set<string>): TablePath | null {
  if (from === to) return { tables: [from], edges: [] };
  const adj = new Map<string, Array<{ to: string; edge: number }>>();
  const link = (a: string, b: string, edge: number) => {
    let l = adj.get(a);
    if (!l) adj.set(a, (l = []));
    l.push({ to: b, edge });
  };
  edges.forEach((r, i) => {
    const a = r.from.table,
      b = r.to.table;
    if (a === b) return;
    if (allowed && (!allowed.has(a) || !allowed.has(b))) return;
    link(a, b, i);
    link(b, a, i);
  });

  // prev[n] = the step that first reached n; walking it back yields the path.
  const prev = new Map<string, { from: string; edge: number }>();
  const seen = new Set<string>([from]);
  let frontier = [from];
  while (frontier.length && !seen.has(to)) {
    const next: string[] = [];
    for (const n of frontier)
      for (const s of adj.get(n) || [])
        if (!seen.has(s.to)) {
          seen.add(s.to);
          prev.set(s.to, { from: n, edge: s.edge });
          next.push(s.to);
        }
    frontier = next;
  }
  if (!seen.has(to)) return null;

  const tables = [to],
    used: number[] = [];
  for (let n = to; n !== from; ) {
    const p = prev.get(n)!;
    used.push(p.edge);
    tables.push(p.from);
    n = p.from;
  }
  return { tables: tables.reverse(), edges: used.reverse() };
}
