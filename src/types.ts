// Shared data model for the parsed DBML schema.

export interface Column {
  name: string;
  type: string;
  pk: boolean;
  fk?: boolean;
  note: string | null;
}

export interface Table {
  name: string;
  columns: Column[];
  group: string | null;
  note: string | null;
  legacy: boolean;
  /** Computed at render time by sizeTable(). */
  width?: number;
  height?: number;
}

export interface RefEndpoint {
  table: string;
  col: string;
}

export interface Ref {
  from: RefEndpoint;
  to: RefEndpoint;
  /** Relationship symbol as written in DBML: ">", "<", "-", "<>". */
  sym: string;
}

export interface Group {
  id: string;
  title: string;
  color: string;
}

export interface Model {
  tables: Table[];
  refs: Ref[];
  groups: Group[];
  enums: Record<string, string[]>;
}

export interface Point {
  x: number;
  y: number;
}

export interface GroupBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Spacing derived from the density slider. */
export interface Spacing {
  node: number;
  rank: number;
  group: number;
}

export interface EdgeGeometry {
  d: string;
  A: Point;
  B: Point;
  aS: "l" | "r";
  bS: "l" | "r";
}
