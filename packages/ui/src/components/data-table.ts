import { UIStateType, renderUIState } from "./states.js";

export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => string;
}

export interface TableAction<T> {
  id: string;
  label: string;
  onClick?: (row: T) => void;
  render?: (row: T) => string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export interface DataTableProps<T = any> {
  id?: string;
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: string | ((row: T) => string);
  totalCount?: number;
  page?: number;
  pageSize?: number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  selectable?: boolean;
  actions?: TableAction<T>[];
  state?: UIStateType;
  errorMessage?: string;
  emptyMessage?: string;
  emptyTitle?: string;
  ariaLabel?: string;
}

/**
 * DataTable: Standardized high-performance tabular data grid.
 * Adheres strictly to Section 5.4 of 03_FRONTEND_SPEC.md:
 * - Server-side pagination controls (default 50, max 250)
 * - Sorting, row selection, actions
 * - Universal 6-state rendering (loading, empty, error, partial_failure, permission_denied)
 * - Accessible tables with proper scope, aria headers, and sticky table header.
 */
export function renderDataTable<T = any>(props: DataTableProps<T>): string {
  const tableId = props.id || "data-table";
  const page = props.page || 1;
  const pageSize = Math.min(props.pageSize || 50, 250);
  const totalCount = props.totalCount !== undefined ? props.totalCount : props.data.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentState = props.state || (props.data.length === 0 ? "empty" : "success");

  // If table is in a non-success state, render the semantic state container inside the table wrapper
  if (currentState !== "success") {
    let stateHtml = "";
    if (currentState === "loading") {
      stateHtml = renderUIState({
        type: "loading",
        title: "Loading records...",
        message: "Fetching authoritative dataset from ledger"
      });
    } else if (currentState === "empty") {
      stateHtml = renderUIState({
        type: "empty",
        title: props.emptyTitle || "No records found",
        message: props.emptyMessage || "No data matching the selected criteria or filters."
      });
    } else if (currentState === "error") {
      stateHtml = renderUIState({
        type: "error",
        title: "Failed to load table data",
        message: props.errorMessage || "An error occurred while querying records."
      });
    } else if (currentState === "partial_failure") {
      stateHtml = renderUIState({
        type: "partial_failure",
        title: "Partial data loaded",
        message: "Some records could not be retrieved from external providers."
      });
    } else if (currentState === "permission_denied") {
      stateHtml = renderUIState({
        type: "permission_denied",
        title: "Access Restricted",
        message: "You lack permission to view this dataset."
      });
    }

    return `
      <div class="data-table-container" id="${tableId}-container">
        <div class="data-table-state-box">
          ${stateHtml}
        </div>
      </div>
    `;
  }

  // Render Table Headers
  const headerColsHtml = props.columns.map((col) => {
    const isSorted = props.sortColumn === col.key;
    const sortDir = isSorted ? props.sortDirection || "asc" : undefined;
    const sortIcon = col.sortable 
      ? isSorted 
        ? sortDir === "asc"
          ? `<svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`
          : `<svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`
        : `<svg class="sort-icon opacity-30" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`
      : "";

    const alignClass = col.align ? `align-${col.align}` : "align-left";
    const widthStyle = col.width ? `style="width: ${col.width};"` : "";

    return `
      <th scope="col" 
          class="table-th ${alignClass} ${col.sortable ? 'sortable-th' : ''} ${isSorted ? 'sorted-th' : ''}"
          ${widthStyle}
          ${col.sortable ? `data-sort-col="${col.key}" role="columnheader" aria-sort="${isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}" tabindex="0"` : ''}>
        <div class="th-content">
          <span>${col.header}</span>
          ${sortIcon}
        </div>
      </th>
    `;
  }).join("");

  const selectHeaderHtml = props.selectable 
    ? `<th scope="col" class="table-th select-th" style="width: 40px;"><input type="checkbox" class="table-select-all" aria-label="Select all rows" /></th>` 
    : "";

  const actionsHeaderHtml = props.actions && props.actions.length > 0 
    ? `<th scope="col" class="table-th actions-th" style="width: 100px; text-align: right;">Actions</th>` 
    : "";

  // Render Table Rows
  const rowsHtml = props.data.map((row, rowIndex) => {
    const key = typeof props.rowKey === "function" ? props.rowKey(row) : (row as any)[props.rowKey] || `row-${rowIndex}`;

    const cellsHtml = props.columns.map((col) => {
      const cellContent = col.render 
        ? col.render(row, rowIndex) 
        : String((row as any)[col.key] ?? "");
      const alignClass = col.align ? `align-${col.align}` : "align-left";

      return `<td class="table-td ${alignClass}">${cellContent}</td>`;
    }).join("");

    const selectCellHtml = props.selectable 
      ? `<td class="table-td select-td"><input type="checkbox" class="table-row-select" data-row-key="${key}" aria-label="Select row ${rowIndex + 1}" /></td>` 
      : "";

    let actionsCellHtml = "";
    if (props.actions && props.actions.length > 0) {
      const renderedActions = props.actions.map(action => {
        if (action.render) return action.render(row);
        return `
          <button class="btn btn-${action.variant || 'ghost'} btn-xs" data-action="${action.id}" data-row-key="${key}">
            ${action.label}
          </button>
        `;
      }).join(" ");

      actionsCellHtml = `<td class="table-td actions-td align-right">${renderedActions}</td>`;
    }

    return `
      <tr class="table-tr" data-row-key="${key}">
        ${selectHeaderHtml ? selectCellHtml : ""}
        ${cellsHtml}
        ${actionsHeaderHtml ? actionsCellHtml : ""}
      </tr>
    `;
  }).join("");

  // Pagination HTML
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  const paginationHtml = `
    <div class="data-table-pagination" role="navigation" aria-label="Table Pagination">
      <div class="pagination-info">
        Showing <span class="fw-semibold">${startItem}</span> to <span class="fw-semibold">${endItem}</span> of <span class="fw-semibold">${totalCount.toLocaleString()}</span> records
      </div>
      <div class="pagination-controls">
        <div class="page-size-selector">
          <label for="${tableId}-page-size" class="page-size-label">Rows per page:</label>
          <select id="${tableId}-page-size" class="select select-sm page-size-select" data-table-id="${tableId}">
            <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
            <option value="250" ${pageSize === 250 ? 'selected' : ''}>250</option>
          </select>
        </div>
        <div class="pagination-buttons">
          <button class="btn btn-secondary btn-sm pagination-prev" 
                  data-page="${page - 1}" 
                  ${page <= 1 ? 'disabled aria-disabled="true"' : ''}
                  aria-label="Previous Page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Previous</span>
          </button>
          <span class="pagination-current-page" aria-current="page">Page ${page} of ${totalPages}</span>
          <button class="btn btn-secondary btn-sm pagination-next" 
                  data-page="${page + 1}" 
                  ${page >= totalPages ? 'disabled aria-disabled="true"' : ''}
                  aria-label="Next Page">
            <span>Next</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  return `
    <div class="data-table-container" id="${tableId}-container">
      <div class="table-responsive-wrapper">
        <table class="data-table" id="${tableId}" role="grid" aria-label="${props.ariaLabel || 'Data Grid'}">
          <thead class="table-thead">
            <tr class="table-header-tr">
              ${selectHeaderHtml}
              ${headerColsHtml}
              ${actionsHeaderHtml}
            </tr>
          </thead>
          <tbody class="table-tbody">
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      ${paginationHtml}
    </div>
  `;
}
