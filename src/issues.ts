// Schema lint: structural problems worth a second look when reading a schema.
//
// Pure — takes a parsed Model, returns plain data — so it can be re-run on every
// re-parse and (later) unit tested. Heuristics are deliberately conservative:
// a lint that cries wolf gets ignored, so ambiguous cases are skipped rather
// than flagged.

import { inferSoftRefs, refEnds, singular } from "./metrics";
import type { Column, Model, Ref, Table } from "./types";

export type IssueKind = "no-pk" | "type-mismatch" | "dangling-ref" | "id-no-fk" | "naming" | "dup-column";

export interface Issue {
  kind: IssueKind;
  table: string;
  column?: string;
  message: string;
  severity: "warn" | "info";
}

/** Display order + heading for each kind in the panel. */
export const ISSUE_KINDS: Array<{ kind: IssueKind; label: string }> = [
  { kind: "dangling-ref", label: "Dangling references" },
  { kind: "type-mismatch", label: "FK type mismatch" },
  { kind: "no-pk", label: "No primary key" },
  { kind: "dup-column", label: "Duplicate columns" },
  { kind: "id-no-fk", label: "*_id without a foreign key" },
  { kind: "naming", label: "Naming inconsistency" },
];

// ── Type normalisation ──────────────────────────────────────────────────────

/** Spelling variants that mean the same type, keyed by lowercase base name. */
const TYPE_ALIAS: Record<string, string> = {
  int: "int", integer: "int", int4: "int", serial: "int", serial4: "int", mediumint: "int",
  bigint: "bigint", int8: "bigint", bigserial: "bigint", serial8: "bigint",
  smallint: "smallint", int2: "smallint", smallserial: "smallint", serial2: "smallint",
  varchar: "varchar", "character varying": "varchar", "char varying": "varchar", string: "varchar",
  char: "char", character: "char", bpchar: "char",
  bool: "bool", boolean: "bool",
  decimal: "decimal", numeric: "decimal",
  float: "float", float8: "float", double: "float", "double precision": "float",
  real: "real", float4: "real",
  datetime: "timestamp", timestamp: "timestamp",
};

interface NormType {
  base: string;
  unsigned: boolean;
}

/** `VARCHAR(255)` → varchar, `int unsigned` → int + unsigned, `INT4` → int. */
export function normalizeType(raw: string): NormType | null {
  let s = raw.toLowerCase().trim();
  if (!s) return null;
  const unsigned = /\bunsigned\b/.test(s);
  // Length/precision (`varchar(255)`, `decimal(10,2)`) and array suffixes don't
  // change what a join key *is*, so they are dropped before comparing.
  s = s.replace(/\([^)]*\)/g, "").replace(/\[\]/g, "").replace(/\b(unsigned|signed|zerofill)\b/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return { base: TYPE_ALIAS[s] || s, unsigned };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const colKey = (t: string, c: string) => t + "." + c;

/** Words that end in "s" (or never inflect) but are not plurals. */
const NOT_PLURAL = new Set([
  "data", "media", "news", "series", "species", "information", "metadata", "staff",
  "equipment", "settings", "status", "bus", "alias", "canvas", "atlas", "access",
]);

/**
 * Plural / singular / unknown for a table name, judged by its last word
 * (`user_roles` → "roles"). Words ending in -us/-is/-ss are ambiguous
 * (`status`, `analysis`, `address`) and return null rather than guess.
 */
function nameNumber(name: string): "plural" | "singular" | null {
  const word = (name.split(".").pop() || name).split("_").pop()!.toLowerCase();
  if (word.length < 3 || NOT_PLURAL.has(word)) return null;
  if (/(us|is|ss)$/.test(word)) return null;
  return singular(word) !== word ? "plural" : "singular";
}

// ── Checks ──────────────────────────────────────────────────────────────────

function checkNoPk(model: Model, out: Issue[]): void {
  for (const t of model.tables)
    if (!t.columns.some((c) => c.pk))
      out.push({
        kind: "no-pk",
        table: t.name,
        severity: "warn",
        message: "has no primary key",
      });
}

function checkDuplicates(model: Model, out: Issue[]): void {
  for (const t of model.tables) {
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const c of t.columns) {
      // Index lines inside a `indexes { }` block parse as pseudo-columns with no
      // type; ignoring typeless rows keeps them from colliding with real ones.
      if (!c.type) continue;
      const k = c.name.toLowerCase();
      if (seen.has(k) && !reported.has(k)) {
        reported.add(k);
        out.push({
          kind: "dup-column",
          table: t.name,
          column: c.name,
          severity: "warn",
          message: `column "${c.name}" is declared more than once`,
        });
      }
      seen.add(k);
    }
  }
}

function findCol(t: Table | undefined, name: string): Column | undefined {
  return t?.columns.find((c) => c.name === name);
}

/** Dangling refs first, so the type check can skip refs that are already broken. */
function checkRefs(model: Model, byName: Record<string, Table>, out: Issue[]): void {
  for (const r of model.refs) {
    const missing: string[] = [];
    for (const e of [r.from, r.to]) {
      if (!byName[e.table]) missing.push(`table "${e.table}"`);
      else if (!findCol(byName[e.table], e.col)) missing.push(`column "${e.table}.${e.col}"`);
    }
    if (missing.length) {
      const sym = r.sym || ">";
      // Anchor on a table that exists so the row is clickable.
      const anchor = byName[r.from.table] ? r.from : byName[r.to.table] ? r.to : r.from;
      out.push({
        kind: "dangling-ref",
        table: anchor.table,
        column: anchor.col,
        severity: "warn",
        message: `Ref ${r.from.table}.${r.from.col} ${sym} ${r.to.table}.${r.to.col}: ${missing.join(" and ")} not found`,
      });
      continue;
    }
    for (const { child, parent } of refEnds(r)) {
      const a = normalizeType(findCol(byName[child.table], child.col)!.type);
      const b = normalizeType(findCol(byName[parent.table], parent.col)!.type);
      if (!a || !b) continue;
      const ct = findCol(byName[child.table], child.col)!.type;
      const pt = findCol(byName[parent.table], parent.col)!.type;
      if (a.base !== b.base)
        out.push({
          kind: "type-mismatch",
          table: child.table,
          column: child.col,
          severity: "warn",
          message: `${child.col} is ${ct} but references ${parent.table}.${parent.col} (${pt})`,
        });
      else if (a.unsigned !== b.unsigned)
        out.push({
          kind: "type-mismatch",
          table: child.table,
          column: child.col,
          severity: "warn",
          message: `${child.col} (${ct}) and ${parent.table}.${parent.col} (${pt}) differ in unsigned`,
        });
    }
  }
}

function checkIdColumns(model: Model, softRefs: Ref[], out: Issue[]): void {
  // Any column that appears on either end of a declared ref counts as covered.
  const covered = new Set<string>();
  for (const r of model.refs) {
    covered.add(colKey(r.from.table, r.from.col));
    covered.add(colKey(r.to.table, r.to.col));
  }
  const soft: Record<string, Ref> = {};
  for (const r of softRefs) soft[colKey(r.from.table, r.from.col)] ||= r;

  for (const t of model.tables) {
    const names = new Set(t.columns.map((c) => c.name.toLowerCase()));
    for (const c of t.columns) {
      const n = c.name.toLowerCase();
      if (c.pk || c.fk || !c.type || !/.+_id$/.test(n) || covered.has(colKey(t.name, c.name))) continue;
      // `source_type` + `source_id` is a polymorphic pair; no single FK can exist.
      if (names.has(n.replace(/_id$/, "_type"))) continue;
      const guess = soft[colKey(t.name, c.name)];
      out.push(
        guess
          ? {
              kind: "id-no-fk",
              table: t.name,
              column: c.name,
              severity: "info",
              message: `${c.name} has no FK; inferred reference to ${guess.to.table}.${guess.to.col}`,
            }
          : {
              kind: "id-no-fk",
              table: t.name,
              column: c.name,
              severity: "warn",
              message: `${c.name} looks like a foreign key but has no FK and matches no table`,
            }
      );
    }
  }
}

/** Flag the minority singular/plural style, only when the schema has a clear majority. */
function checkNaming(model: Model, out: Issue[]): void {
  // Join tables are named after their two parents (`role_user`), so their
  // number says nothing about the schema's convention.
  const ownFks: Record<string, Set<string>> = {};
  for (const r of model.refs)
    for (const { child } of refEnds(r)) (ownFks[child.table] ||= new Set()).add(child.col);

  const plural: string[] = [];
  const single: string[] = [];
  for (const t of model.tables) {
    if (t.name.includes("_") && (ownFks[t.name]?.size || 0) >= 2) continue;
    const n = nameNumber(t.name);
    if (n === "plural") plural.push(t.name);
    else if (n === "singular") single.push(t.name);
  }
  const total = plural.length + single.length;
  if (total < 4 || plural.length === single.length) return;

  const pluralWins = plural.length > single.length;
  const minority = pluralWins ? single : plural;
  const majority = pluralWins ? plural.length : single.length;
  for (const name of minority)
    out.push({
      kind: "naming",
      table: name,
      severity: "info",
      message: `looks ${pluralWins ? "singular" : "plural"}, but ${majority} of ${total} tables are ${pluralWins ? "plural" : "singular"}`,
    });
}

/**
 * Run every check. `softRefs` are the inferred relationships (from metrics.ts);
 * they are recomputed when omitted so the function stays usable standalone.
 */
export function findIssues(model: Model, softRefs?: Ref[]): Issue[] {
  const soft = softRefs || inferSoftRefs(model);
  const byName: Record<string, Table> = {};
  model.tables.forEach((t) => (byName[t.name] = t));

  const out: Issue[] = [];
  checkRefs(model, byName, out);
  checkNoPk(model, out);
  checkDuplicates(model, out);
  checkIdColumns(model, soft, out);
  checkNaming(model, out);
  return out;
}
