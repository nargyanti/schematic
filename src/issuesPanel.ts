// "Issues ▾" panel: renders findIssues() output grouped by kind.

import { findIssues, ISSUE_KINDS, type Issue, type IssueKind } from "./issues";
import { focusTableByName } from "./panels";
import { state } from "./state";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Groups the user has toggled, so a rebuild (re-parse) doesn't reset them. */
const toggled = new Set<IssueKind>();
/** Long groups start collapsed; short lists start open so nothing is hidden needlessly. */
const AUTO_OPEN_MAX = 12;

function isOpen(kind: IssueKind, count: number): boolean {
  return toggled.has(kind) ? count > AUTO_OPEN_MAX : count <= AUTO_OPEN_MAX;
}

function issueRow(i: Issue): HTMLElement {
  const row = document.createElement("div");
  const exists = !!state.tableByName[i.table];
  row.className = "soft-row issue-row" + (exists ? " cursor-pointer" : "");
  const dot = document.createElement("span");
  dot.className = "issue-dot " + i.severity;
  dot.title = i.severity === "warn" ? "warning" : "info";
  const where = document.createElement("b");
  where.textContent = i.column ? `${i.table}.${i.column}` : i.table;
  const msg = document.createElement("span");
  msg.className = "text-[#7a8199]";
  msg.textContent = i.message;
  row.append(dot, where, msg);
  if (exists) row.addEventListener("click", () => focusTableByName(i.table));
  return row;
}

/** Recompute issues for the current model and redraw the panel + badge. Call after every re-parse. */
export function buildIssuesPanel(): void {
  const list = $("issuesList");
  const issues = findIssues(state.model, state.softRefs);
  list.innerHTML = "";

  const badge = $("issuesBadge");
  badge.textContent = String(issues.length);
  badge.classList.toggle("hidden", issues.length === 0);

  if (!issues.length) {
    list.innerHTML = `<div class="soft-row text-[#98a0b6]">No issues found ✓</div>`;
    return;
  }

  for (const { kind, label } of ISSUE_KINDS) {
    const items = issues.filter((i) => i.kind === kind);
    if (!items.length) continue;
    const open = isOpen(kind, items.length);

    const head = document.createElement("div");
    head.className = "soft-row cursor-pointer";
    const caret = document.createElement("span");
    caret.textContent = open ? "▾" : "▸";
    const name = document.createElement("span");
    name.className = "font-semibold text-[#28324d]";
    name.textContent = label;
    const cnt = document.createElement("span");
    cnt.className = "ml-auto text-[#98a0b6]";
    cnt.textContent = String(items.length);
    head.append(caret, name, cnt);

    const kids = document.createElement("div");
    kids.className = "pl-3" + (open ? "" : " hidden");
    items.forEach((i) => kids.appendChild(issueRow(i)));

    head.addEventListener("click", () => {
      const nowHidden = kids.classList.toggle("hidden");
      caret.textContent = nowHidden ? "▸" : "▾";
      if (toggled.has(kind)) toggled.delete(kind);
      else toggled.add(kind);
    });
    list.append(head, kids);
  }
}
