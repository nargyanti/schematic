// Sample schema shown on first load / "Sample" button.
// The `// [n] TITLE` comment lines define domains (groups) — see README.
export const SAMPLE = `// [1] CONTENT
Table users {
  id integer [pk, increment]
  full_name varchar
  email varchar [unique, not null]
  role user_role
  note: 'User accounts, shared with other apps.'
}
Table posts {
  id integer [pk, increment]
  title varchar [not null]
  author_id integer [ref: > users.id, note: 'article author']
  status post_status
}
Table comments {
  id integer [pk]
  post_id integer
  author_id integer
  body text
}
// [2] TAXONOMY
Table tags { id integer [pk] name varchar [unique] }
Table post_tags { post_id integer tag_id integer }
Enum user_role { admin editor viewer }
Enum post_status { draft published archived }
Ref: comments.post_id > posts.id
Ref: comments.author_id > users.id
Ref: post_tags.post_id > posts.id
Ref: post_tags.tag_id > tags.id
`;

// Palette assigned to domains in declaration order.
export const GROUP_COLORS = [
  "#2b3a5c", "#3b5bdb", "#2f9e8f", "#b5642e", "#7048a8", "#c0392b", "#1f7a4d",
  "#8a6d3b", "#3a6fa5", "#a03e6b", "#4a5568", "#2a7ab0", "#6b8e23", "#9c5518",
];

// Tables listed here are drawn with a dashed red "LEGACY" badge.
// Empty by default — add your own table names to flag deprecated tables.
export const LEGACY_TABLES = new Set<string>([]);

// Typography + table geometry.
export const NAME_FONT = "650 13px Inter, sans-serif";
export const COL_FONT = "12px monospace";
export const TYPE_FONT = "11.5px monospace";
export const HEAD_H = 34;
export const ROW_H = 27;
export const PAD_X = 14;
export const GAP = 18;
export const BADGE = 22;
