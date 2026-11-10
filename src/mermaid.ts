// Export the schema as a Mermaid `erDiagram`.
//
// Mermaid's grammar is much stricter than DBML's: entity names and types must be
// bare identifiers, and relationship lines need a label. Everything user-supplied
// is therefore sanitised down to [A-Za-z0-9_] rather than quoted, which renders
// in every Mermaid version (quoted entity aliases need >= 10.5).

import { refEnds } from "./metrics";
import type { Ref, Table } from "./types";

/** Collapse anything outside [A-Za-z0-9_] to "_" and make it start with a letter/underscore. */
function ident(raw: string, fallback: string): string {
  let s = raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/_+$/, "");
  if (!s) s = fallback;
  return /^[0-9]/.test(s) ? "_" + s : s;
}

/** `varchar(255)` → `varchar_255`, `decimal(10, 2)` → `decimal_10_2`, `int[]` → `int`. */
function mermaidType(t: string): string {
  return ident(t, "unknown");
}

/** Comments live inside double quotes, so quotes/newlines/`#` (entity syntax) must go. */
function mermaidComment(note: string): string {
  return note.replace(/"/g, "'").replace(/#/g, "").replace(/\s+/g, " ").trim();
}

/**
 * DBML relationship → Mermaid crow's-foot pair (left side = ref.from).
 * The "one" side is `||` (exactly one): DBML says nothing about nullability.
 */
const CARD: Record<string, string> = {
  ">": "}o--||", // many-to-one: from holds the FK
  "<": "||--o{", // one-to-many: to holds the FK
  "-": "||--||", // one-to-one
  "<>": "}o--o{", // many-to-many
};

/**
 * Build the diagram text. Only declared refs are exported — inferred (soft) refs
 * are guesses and would present them as fact in a document people share.
 */
export function toMermaid(tables: Table[], refs: Ref[]): string {
  // Sanitising can collide (`a.b` and `a_b`); suffix later ones to stay unique.
  const ids: Record<string, string> = {};
  const used = new Set<string>();
  for (const t of tables) {
    const base = ident(t.name, "table");
    let id = base;
    for (let n = 2; used.has(id); n++) id = base + "_" + n;
    used.add(id);
    ids[t.name] = id;
  }

  const lines: string[] = ["erDiagram"];
  for (const t of tables) {
    if (!t.columns.length) {
      lines.push(`  ${ids[t.name]}`);
      continue;
    }
    lines.push(`  ${ids[t.name]} {`);
    for (const c of t.columns) {
      const keys = [c.pk ? "PK" : "", c.fk ? "FK" : ""].filter(Boolean).join(", ");
      const note = c.note ? mermaidComment(c.note) : "";
      let l = `    ${mermaidType(c.type)} ${ident(c.name, "col")}`;
      if (keys) l += ` ${keys}`;
      if (note) l += ` "${note}"`;
      lines.push(l);
    }
    lines.push("  }");
  }

  const seen = new Set<string>();
  for (const r of refs) {
    if (r.inferred || !ids[r.from.table] || !ids[r.to.table]) continue;
    const card = CARD[r.sym || ">"] || CARD[">"];
    // Label with the FK column so parallel edges between two tables stay distinguishable.
    const label = ident(refEnds(r)[0]?.child.col || r.from.col, "ref");
    const line = `  ${ids[r.from.table]} ${card} ${ids[r.to.table]} : "${label}"`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines.join("\n") + "\n";
}
