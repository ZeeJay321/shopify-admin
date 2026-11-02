/** Row selection state for tables (pure; immutable sets). */

export type Selection = ReadonlySet<string>;

export const EMPTY_SELECTION: Selection = new Set();

export function toggleRow(selection: Selection, id: string): Selection {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Header checkbox: select or clear every row on the current page. */
export function setPage(
  selection: Selection,
  pageIds: readonly string[],
  checked: boolean,
): Selection {
  const next = new Set(selection);
  for (const id of pageIds) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** "all", "some" (indeterminate) or "none" for the header checkbox. */
export function pageState(
  selection: Selection,
  pageIds: readonly string[],
): "all" | "some" | "none" {
  const selected = pageIds.filter((id) => selection.has(id)).length;
  if (selected === 0) return "none";
  return selected === pageIds.length ? "all" : "some";
}

/** Keep only ids still visible (after a reload or filter change). */
export function pruneSelection(
  selection: Selection,
  visibleIds: readonly string[],
): Selection {
  const visible = new Set(visibleIds);
  const next = [...selection].filter((id) => visible.has(id));
  return next.length === selection.size ? selection : new Set(next);
}

export function exceedsCap(selection: Selection, cap: number): boolean {
  return selection.size > cap;
}
