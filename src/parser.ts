import { GROUP_COLORS, LEGACY_TABLES } from "./constants";
import type { Column, Group, Model, Ref } from "./types";

// Detect `// [n] TITLE` section markers and map each table to its domain.
function detectSections(src: string): { map: Record<string, string>; groups: Group[] } {
  const map: Record<string, string> = {};
  const groups: Group[] = [];
  let cur: Group | null = null;
  let ci = 0;
  const secRe = /^\s*\/\/\s*\[(\w+)\]\s*(.+?)\s*$/;
  const tblRe = /^\s*Table\s+([`"'\w.]+)/i;
  src.split("\n").forEach((line) => {
    let m = line.match(secRe);
    if (m) {
      const title = m[2].replace(/[─—\-\s]+$/, "").trim();
      // Skip legend/index lines that list multiple "[n] Title" pairs on one line —
      // those aren't real section headers, just documentation above the real ones.
      if (/\[\w+\]/.test(title)) return;
      cur = { id: "g" + groups.length, title, color: GROUP_COLORS[ci++ % GROUP_COLORS.length] };
      groups.push(cur);
      return;
    }
    m = line.match(tblRe);
    if (m) {
      const name = m[1].replace(/^[`"']|[`"']$/g, "");
      if (cur) map[name] = cur.id;
    }
  });
  return { map, groups };
}

// Strip block and line comments while respecting quoted strings.
function stripComments(t: string): string {
  t = t.replace(/\/\*[\s\S]*?\*\//g, "");
  return t
    .split("\n")
    .map((l) => {
      let o = "";
      let q: string | null = null;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (q) {
          o += c;
          if (c === q) q = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") {
          q = c;
          o += c;
          continue;
        }
        if (c === "/" && l[i + 1] === "/") break;
        o += c;
      }
      return o;
    })
    .join("\n");
}

function clean(s: string | undefined): string {
  return (s || "").replace(/^[`"']|[`"']$/g, "").trim();
}

// Find the matching closing brace for the block opening at index `open`.
function matchBlock(text: string, open: number): { inner: string; end: number } {
  let d = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") d++;
    else if (text[i] === "}") {
      d--;
      if (d === 0) return { inner: text.slice(open + 1, i), end: i };
    }
  }
  return { inner: text.slice(open + 1), end: text.length };
}

interface ColSettings {
  pk: boolean;
  note: string | null;
}

function parseColSettings(raw: string, colRefs: Ref[], tn: string, cn: string): ColSettings {
  const s: ColSettings = { pk: false, note: null };
  if (!raw) return s;
  raw = raw.replace(/note\s*:\s*'((?:[^'\\]|\\.)*)'/i, (_m, p) => {
    s.note = p;
    return "";
  });
  raw = raw.replace(/note\s*:\s*"((?:[^"\\]|\\.)*)"/i, (_m, p) => {
    s.note = p;
    return "";
  });
  const parts: string[] = [];
  let d = 0;
  let cur = "";
  for (const ch of raw) {
    if (ch === "(") d++;
    if (ch === ")") d--;
    if (ch === "," && d === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  for (let p of parts) {
    p = p.trim();
    const low = p.toLowerCase();
    if (low === "pk" || low === "primary key") s.pk = true;
    else if (low.startsWith("ref:")) {
      const m = p.match(/ref:\s*([<>-]+)\s*([`"'\w.]+)/i);
      if (m) {
        const t = m[2].split(".");
        if (t.length >= 2)
          colRefs.push({
            from: { table: tn, col: cn },
            to: { table: clean(t[0]), col: clean(t[1]) },
            sym: m[1],
          });
      }
    }
  }
  return s;
}

function parseColumn(line: string, colRefs: Ref[], tn: string): Column | null {
  line = line.trim();
  if (!line) return null;
  let st = "";
  const b = line.match(/\[([^\]]*)\]\s*$/);
  if (b) {
    st = b[1];
    line = line.slice(0, b.index).trim();
  }
  const parts = line.split(/\s+/);
  if (!parts[0]) return null;
  const name = clean(parts[0]);
  const type = parts.slice(1).join(" ") || "";
  const s = parseColSettings(st, colRefs, tn, name);
  return { name, type, pk: s.pk, note: s.note };
}

export function parseDBML(src: string): Model {
  const sec = detectSections(src);
  const text = stripComments(src);
  const tables: Model["tables"] = [];
  const refs: Ref[] = [];
  const colRefs: Ref[] = [];
  const enums: Record<string, string[]> = {};
  let i = 0;
  const tableRe = /Table\s+([`"'\w.]+)(?:\s+as\s+\w+)?\s*(?:\[[^\]]*\])?\s*\{/iy;
  const enumRe = /Enum\s+([`"'\w.]+)\s*\{/iy;
  const refInlineRe = /Ref\b[^{:\n]*:\s*([`"'\w.]+(?:\s*,\s*[`"'\w.]+)*)\s*([<>-]+)\s*([`"'\w.]+)/iy;
  const refBlockRe = /Ref\b[^{]*\{/iy;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    tableRe.lastIndex = enumRe.lastIndex = refInlineRe.lastIndex = refBlockRe.lastIndex = i;
    let m: RegExpExecArray | null;
    if ((m = tableRe.exec(text)) && m.index === i) {
      const name = clean(m[1]);
      const open = text.indexOf("{", i);
      const { inner, end } = matchBlock(text, open);
      const cols: Column[] = [];
      let tnote: string | null = null;
      inner.split("\n").forEach((l) => {
        const tl = l.trim();
        if (/^note\s*:/i.test(tl)) {
          const nm = tl.match(/:\s*'([\s\S]*)'\s*$/) || tl.match(/:\s*"([\s\S]*)"\s*$/);
          if (nm) tnote = nm[1];
          return;
        }
        if (/^indexes/i.test(tl)) return;
        const c = parseColumn(l, colRefs, name);
        if (c) cols.push(c);
      });
      tables.push({
        name,
        columns: cols,
        group: sec.map[name] || null,
        note: tnote,
        legacy: LEGACY_TABLES.has(name),
      });
      i = end + 1;
      continue;
    }
    if ((m = enumRe.exec(text)) && m.index === i) {
      const name = clean(m[1]);
      const open = text.indexOf("{", i);
      const { inner, end } = matchBlock(text, open);
      enums[name] = inner
        .split("\n")
        .map((s) => clean(s.replace(/\[[^\]]*\]/, "")))
        .filter(Boolean);
      i = end + 1;
      continue;
    }
    if ((m = refInlineRe.exec(text)) && m.index === i) {
      const froms = m[1].split(",").map((s) => clean(s));
      const to = clean(m[3]).split(".");
      const sym = m[2];
      froms.forEach((f) => {
        const ff = f.split(".");
        if (ff.length >= 2 && to.length >= 2)
          refs.push({
            from: { table: clean(ff[0]), col: clean(ff[1]) },
            to: { table: clean(to[0]), col: clean(to[1]) },
            sym,
          });
      });
      i = refInlineRe.lastIndex;
      continue;
    }
    if ((m = refBlockRe.exec(text)) && m.index === i) {
      const open = text.indexOf("{", i);
      const { inner, end } = matchBlock(text, open);
      inner.split("\n").forEach((l) => {
        const rm = l.match(/([`"'\w.]+)\s*([<>-]+)\s*([`"'\w.]+)/);
        if (rm) {
          const f = rm[1].split(".");
          const t = rm[3].split(".");
          if (f.length >= 2 && t.length >= 2)
            refs.push({
              from: { table: clean(f[0]), col: clean(f[1]) },
              to: { table: clean(t[0]), col: clean(t[1]) },
              sym: rm[2],
            });
        }
      });
      i = end + 1;
      continue;
    }
    const nl = text.indexOf("\n", i);
    i = nl === -1 ? text.length : nl + 1;
  }
  const allRefs = [...refs, ...colRefs];
  const fk = new Set<string>();
  allRefs.forEach((r) => {
    const s = r.sym || ">";
    if (s.includes(">") || s === "-") fk.add(r.from.table + "." + r.from.col);
    if (s.includes("<")) fk.add(r.to.table + "." + r.to.col);
  });
  tables.forEach((t) =>
    t.columns.forEach((c) => {
      if (fk.has(t.name + "." + c.name)) c.fk = true;
    })
  );
  if (sec.groups.length) {
    const un = tables.filter((t) => !t.group);
    if (un.length) {
      const g: Group = { id: "g_un", title: "Other", color: "#6b7280" };
      sec.groups.push(g);
      un.forEach((t) => (t.group = g.id));
    }
  }
  return { tables, refs: allRefs, enums, groups: sec.groups };
}
