// Foreign-key degree metrics, role classification, and soft-FK inference.
//
// The point of this module is that an ERD only draws what the schema declares.
// A table can be load-bearing and still have zero lines — referenced from code
// through a plain varchar (`cultivations.seed_class` → `seed_classes`) instead
// of a foreign key. Degrees expose those tables (role "orphan"); inferSoftRefs
// guesses the missing edges so they stop being invisible.

import type { Model, Ref, RefEndpoint, Role, Table, TableMetric } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  master: "MASTER",
  trx: "TRX",
  pivot: "PIVOT",
  orphan: "ORPHAN",
};

export const ROLE_COLOR: Record<Role, string> = {
  master: "#2f9e8f",
  trx: "#3b5bdb",
  pivot: "#8a6d3b",
  orphan: "#a03e6b",
};

export const ROLE_HINT: Record<Role, string> = {
  master: "pointed at more than it points",
  trx: "points at other tables — moving data",
  pivot: "many-to-many join table",
  orphan: "no FK at all — reachable only from code",
};

export const ROLES: Role[] = ["master", "trx", "pivot", "orphan"];

/**
 * Split a ref into child→parent pairs. DBML writes the FK holder on the `>`
 * side, so ">" means from is the child; "<" flips it; "<>" is both.
 * Mirrors the FK-badge logic in parser.ts so degrees and badges never disagree.
 */
export function refEnds(r: Ref): Array<{ child: RefEndpoint; parent: RefEndpoint }> {
  const s = r.sym || ">";
  const out: Array<{ child: RefEndpoint; parent: RefEndpoint }> = [];
  if (s.includes(">") || s === "-") out.push({ child: r.from, parent: r.to });
  if (s.includes("<")) out.push({ child: r.to, parent: r.from });
  return out;
}

function classify(t: Table, inD: number, outD: number): Role {
  if (inD === 0 && outD === 0) return "orphan";
  // A junction table is nothing but foreign keys and nobody points back at it.
  if (inD === 0 && outD >= 2 && t.columns.length <= outD + 3) return "pivot";
  if (inD > outD) return "master";
  return "trx";
}

export interface MetricsResult {
  byTable: Record<string, TableMetric>;
  maxOut: number;
  maxIn: number;
  roleCount: Record<Role, number>;
}

export function computeMetrics(model: Model, softRefs: Ref[]): MetricsResult {
  const outCols: Record<string, Set<string>> = {};
  const inTabs: Record<string, Set<string>> = {};
  const softTabs: Record<string, Set<string>> = {};
  const add = (m: Record<string, Set<string>>, k: string, v: string) => (m[k] ||= new Set()).add(v);

  for (const r of model.refs)
    for (const { child, parent } of refEnds(r)) {
      add(outCols, child.table, child.col);
      add(inTabs, parent.table, child.table);
    }
  for (const r of softRefs)
    for (const { child, parent } of refEnds(r)) add(softTabs, parent.table, child.table);

  const byTable: Record<string, TableMetric> = {};
  const roleCount: Record<Role, number> = { master: 0, trx: 0, pivot: 0, orphan: 0 };
  let maxOut = 0;
  let maxIn = 0;
  for (const t of model.tables) {
    const o = outCols[t.name]?.size || 0;
    const i = inTabs[t.name]?.size || 0;
    const role = classify(t, i, o);
    byTable[t.name] = { out: o, in: i, softIn: softTabs[t.name]?.size || 0, role };
    roleCount[role]++;
    if (o > maxOut) maxOut = o;
    if (i > maxIn) maxIn = i;
  }
  return { byTable, maxOut, maxIn, roleCount };
}

// ── Soft-FK inference ───────────────────────────────────────────────────────

/** Column names that never denote a relationship, whatever tables exist. */
const NEVER_REF = new Set([
  "id", "uuid", "created_at", "updated_at", "deleted_at", "created_by", "updated_by",
  "note", "notes", "description", "remark", "remarks", "value", "data", "payload",
  "amount", "total", "qty", "quantity", "price", "date", "time", "year", "month",
]);

/** Suffixes stripped before matching a column name against a table name. */
const SUFFIXES = ["_id", "_code", "_key", "_uuid", "_slug", "_ref"];

/** Column names in the target worth pointing at when the source isn't an id. */
const NATURAL_KEYS = ["code", "key", "slug", "name"];

/** English plural → singular, enough for snake_case table names. */
export function singular(n: string): string {
  if (/ies$/.test(n)) return n.slice(0, -3) + "y";
  if (/(s|x|z|ch|sh)es$/.test(n)) return n.slice(0, -2);
  if (/s$/.test(n) && !/ss$/.test(n)) return n.slice(0, -1);
  return n;
}

function pkColumn(t: Table): string {
  return t.columns.find((c) => c.pk)?.name || "id";
}

function naturalKey(t: Table): string | null {
  for (const k of NATURAL_KEYS) {
    const c = t.columns.find((x) => x.name === k);
    if (c) return c.name;
  }
  return null;
}

/**
 * Guess relationships the schema never declared, by matching column names to
 * table names. Returns refs flagged `inferred` so callers can draw them apart.
 */
export function inferSoftRefs(model: Model): Ref[] {
  // singular table name → real table name, so `seed_class` finds `seed_classes`.
  const lookup: Record<string, string> = {};
  for (const t of model.tables) {
    lookup[t.name.toLowerCase()] ||= t.name;
    lookup[singular(t.name.toLowerCase())] ||= t.name;
  }
  const byName: Record<string, Table> = {};
  model.tables.forEach((t) => (byName[t.name] = t));

  // Skip anything the schema already states, in either direction.
  const declared = new Set<string>();
  for (const r of model.refs) {
    declared.add(r.from.table + "." + r.from.col + "→" + r.to.table);
    declared.add(r.to.table + "." + r.to.col + "→" + r.from.table);
  }

  const out: Ref[] = [];
  const seen = new Set<string>();
  for (const t of model.tables) {
    const colNames = new Set(t.columns.map((c) => c.name));
    for (const c of t.columns) {
      if (c.fk || c.pk) continue;
      const name = c.name.toLowerCase();
      if (NEVER_REF.has(name) || /_at$/.test(name)) continue;
      // Polymorphic pair (`source_type` + `source_id`): the type column holds a
      // class name, not a key, so matching it to a table would be wrong.
      if (/_type$/.test(name) && colNames.has(name.replace(/_type$/, "_id"))) continue;

      let base = name;
      let strong = false;
      for (const sfx of SUFFIXES) {
        if (name.endsWith(sfx) && name.length > sfx.length) {
          base = name.slice(0, -sfx.length);
          strong = sfx === "_id";
          break;
        }
      }
      const target = lookup[base] || lookup[singular(base)];
      if (!target || target === t.name) continue;
      if (declared.has(t.name + "." + c.name + "→" + target)) continue;
      const key = t.name + "." + c.name + "→" + target;
      if (seen.has(key)) continue;
      seen.add(key);

      const tt = byName[target];
      const toCol = strong ? pkColumn(tt) : naturalKey(tt) || pkColumn(tt);
      out.push({
        from: { table: t.name, col: c.name },
        to: { table: target, col: toCol },
        sym: ">",
        inferred: true,
        conf: strong ? "strong" : "weak",
      });
    }
  }
  return out;
}

export function softRefKey(r: Ref): string {
  return r.from.table + "." + r.from.col + "→" + r.to.table;
}
