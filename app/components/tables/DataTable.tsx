/**
 * Reusable data table on s-table: sortable headers, row selection with a
 * selection bar, row action menus, page size and a position indicator.
 * Presentational: state lives in the URL (see useTableUrl) or the caller.
 *
 * s-table has no built-in sorting, selection or sticky header; sorting and
 * selection are built here, and the header isn't sticky.
 */

import type { ReactNode } from "react";
import { MAX_SEARCH_LENGTH, TABLE_PAGE_SIZES } from "../../lib/config";
import type { Selection, SortDir } from "../../lib/tables";
import { pageState, setPage, toggleRow } from "../../lib/tables";

export type Column<R> = {
  key: string;
  header: string;
  render: (row: R) => ReactNode;
  /** Field passed to onSort; omit for columns that can't be sorted. */
  sortField?: string;
  format?: "base" | "numeric" | "currency";
  listSlot?: "primary" | "secondary" | "kicker" | "inline" | "labeled";
};

export type TablePagination = {
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  /** "Showing 21–40 of 172". */
  rangeText: string;
  pageSize: number;
  onPageSize: (size: number) => void;
};

export type TableSelection = {
  selected: Selection;
  onChange: (next: Selection) => void;
  /** Buttons shown in the selection bar. */
  bulkActions?: ReactNode;
  /** Max rows a bulk action accepts; the bar explains when exceeded. */
  cap?: number;
};

export function DataTable<R>({
  label,
  columns,
  rows,
  rowId,
  rowLabel,
  sort = null,
  onSort,
  pagination,
  selection,
  rowActions,
  toolbar,
  loading = false,
  empty,
}: {
  /** Names the table for assistive tech. */
  label: string;
  columns: ReadonlyArray<Column<R>>;
  rows: readonly R[];
  rowId: (row: R) => string;
  /** Used in checkbox and action labels, e.g. the product title. */
  rowLabel: (row: R) => string;
  sort?: { field: string; dir: SortDir } | null;
  onSort?: (field: string) => void;
  pagination: TablePagination;
  selection?: TableSelection;
  rowActions?: (row: R) => ReactNode;
  toolbar?: ReactNode;
  loading?: boolean;
  empty?: ReactNode;
}) {
  const ids = rows.map(rowId);
  const headerState = selection ? pageState(selection.selected, ids) : "none";

  return (
    <s-section padding="none" accessibilityLabel={label}>
      <s-stack gap="small-200">
        {toolbar && (
          <s-box padding="base" paddingBlockEnd="none">
            {toolbar}
          </s-box>
        )}
        {selection && selection.selected.size > 0 && (
          <s-box paddingInline="base">
            <SelectionBar selection={selection} />
          </s-box>
        )}
        <s-table
          variant="auto"
          loading={loading}
          paginate
          hasNextPage={pagination.hasNext}
          hasPreviousPage={pagination.hasPrevious}
          onNextPage={pagination.onNext}
          onPreviousPage={pagination.onPrevious}
        >
          <s-table-header-row>
            {selection && (
              <s-table-header>
                <s-checkbox
                  accessibilityLabel={`Select all ${rows.length} rows on this page`}
                  checked={headerState === "all"}
                  indeterminate={headerState === "some"}
                  disabled={rows.length === 0}
                  onChange={(event) =>
                    selection.onChange(
                      setPage(
                        selection.selected,
                        ids,
                        event.currentTarget.checked,
                      ),
                    )
                  }
                />
              </s-table-header>
            )}
            {columns.map((column) => (
              <s-table-header
                key={column.key}
                listSlot={column.listSlot}
                format={column.format}
              >
                {column.sortField && onSort ? (
                  <SortButton
                    header={column.header}
                    dir={sort?.field === column.sortField ? sort.dir : null}
                    onClick={() => onSort(column.sortField ?? column.key)}
                  />
                ) : (
                  column.header
                )}
              </s-table-header>
            ))}
            {rowActions && (
              <s-table-header>
                <s-text accessibilityVisibility="exclusive">Actions</s-text>
              </s-table-header>
            )}
          </s-table-header-row>
          <s-table-body>
            {rows.map((row, i) => (
              <s-table-row key={ids[i]}>
                {selection && (
                  <s-table-cell>
                    <s-checkbox
                      accessibilityLabel={`Select ${rowLabel(row)}`}
                      checked={selection.selected.has(ids[i])}
                      onChange={() =>
                        selection.onChange(
                          toggleRow(selection.selected, ids[i]),
                        )
                      }
                    />
                  </s-table-cell>
                )}
                {columns.map((column) => (
                  <s-table-cell key={column.key}>
                    {column.render(row)}
                  </s-table-cell>
                ))}
                {rowActions && <s-table-cell>{rowActions(row)}</s-table-cell>}
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        {!loading && rows.length === 0 && empty && (
          <s-box padding="base">{empty}</s-box>
        )}
        <s-box padding="base" paddingBlockStart="none">
          <s-stack
            direction="inline"
            gap="base"
            alignItems="center"
            justifyContent="space-between"
          >
            <s-text color="subdued">{pagination.rangeText}</s-text>
            <s-box inlineSize="140px">
              <s-select
                label="Rows per page"
                value={String(pagination.pageSize)}
                onChange={(event) =>
                  pagination.onPageSize(Number(event.currentTarget.value))
                }
              >
                {TABLE_PAGE_SIZES.map((size) => (
                  <s-option key={size} value={String(size)}>
                    {String(size)}
                  </s-option>
                ))}
              </s-select>
            </s-box>
          </s-stack>
        </s-box>
      </s-stack>
    </s-section>
  );
}

function SortButton({
  header,
  dir,
  onClick,
}: {
  header: string;
  dir: SortDir | null;
  onClick: () => void;
}) {
  const state =
    dir === "asc"
      ? "sorted ascending"
      : dir === "desc"
        ? "sorted descending"
        : "not sorted";
  return (
    <s-button
      variant="tertiary"
      icon={
        dir === "asc"
          ? "sort-ascending"
          : dir === "desc"
            ? "sort-descending"
            : "sort"
      }
      accessibilityLabel={`${header}, ${state}. Sort by ${header}`}
      onClick={onClick}
    >
      {header}
    </s-button>
  );
}

/** "3 selected" with bulk buttons; announced politely. */
function SelectionBar({ selection }: { selection: TableSelection }) {
  const count = selection.selected.size;
  const over = selection.cap !== undefined && count > selection.cap;
  return (
    <s-box
      padding="small"
      borderRadius="base"
      background="subdued"
      accessibilityRole="status"
    >
      <s-stack
        direction="inline"
        gap="base"
        alignItems="center"
        justifyContent="space-between"
      >
        <s-stack gap="small-300">
          <s-text type="strong">{`${count} selected`}</s-text>
          {over && (
            <s-text tone="critical">{`Bulk actions take up to ${selection.cap} at a time. Select fewer rows.`}</s-text>
          )}
        </s-stack>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          {!over && selection.bulkActions}
          <s-button
            variant="tertiary"
            onClick={() => selection.onChange(new Set())}
          >
            Clear selection
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

/** Search box that applies on Enter or blur (not on every keystroke). */
export function TableSearch({
  label,
  placeholder,
  value,
  onSearch,
}: {
  label: string;
  placeholder: string;
  value: string;
  onSearch: (value: string) => void;
}) {
  return (
    <s-search-field
      key={value}
      label={label}
      labelAccessibilityVisibility="exclusive"
      placeholder={placeholder}
      defaultValue={value}
      maxLength={MAX_SEARCH_LENGTH}
      onChange={(event) => onSearch(event.currentTarget.value.trim())}
    />
  );
}

export type RowAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  /** Opens a modal: pass its id. */
  modal?: string;
  external?: boolean;
  disabled?: boolean;
};

/** One action: a plain button. Several: an action menu. */
export function RowActions({
  id,
  label,
  actions,
}: {
  id: string;
  label: string;
  actions: readonly RowAction[];
}) {
  if (actions.length === 0) return null;
  const button = (action: RowAction, variant?: "tertiary") => (
    <s-button
      key={action.label}
      variant={variant}
      disabled={action.disabled}
      href={action.href}
      target={action.external ? "_top" : undefined}
      commandFor={action.modal}
      command={action.modal ? "--show" : undefined}
      onClick={action.onClick}
      accessibilityLabel={`${action.label}: ${label}`}
    >
      {action.label}
    </s-button>
  );
  if (actions.length === 1) return button(actions[0], "tertiary");
  const menuId = `row-actions-${id}`;
  return (
    <>
      <s-button
        variant="tertiary"
        icon="menu-horizontal"
        commandFor={menuId}
        command="--toggle"
        accessibilityLabel={`Actions for ${label}`}
      />
      <s-menu id={menuId} accessibilityLabel={`Actions for ${label}`}>
        {actions.map((action) => button(action))}
      </s-menu>
    </>
  );
}
