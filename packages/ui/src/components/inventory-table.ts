import {
  ConnectedChannelColumnDto,
  InventoryTableRowDto,
  InventoryTableQuery,
} from "@platform/contracts";
import { renderStatusBadge } from "./status-badge.js";

export interface InventoryTableProps {
  items: InventoryTableRowDto[];
  connectedChannels: ConnectedChannelColumnDto[];
  warehouses?: Array<{ id: string; name: string }>;
  activeFilters?: Partial<InventoryTableQuery>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  ariaLabel?: string;
}

/**
 * Helper to render channel icon/badge
 */
function getChannelBadge(provider: string, displayName: string): string {
  const p = provider.toUpperCase();
  let badgeColor = "var(--color-surface-muted, #94a3b8)";
  let badgeBg = "rgba(148, 163, 184, 0.12)";

  if (p.includes("SHOPIFY")) {
    badgeColor = "#95BF47";
    badgeBg = "rgba(149, 191, 71, 0.15)";
  } else if (p.includes("AMAZON")) {
    badgeColor = "#FF9900";
    badgeBg = "rgba(255, 153, 0, 0.15)";
  } else if (p.includes("EBAY")) {
    badgeColor = "#E53238";
    badgeBg = "rgba(229, 50, 56, 0.15)";
  } else if (p.includes("WALMART")) {
    badgeColor = "#0071DC";
    badgeBg = "rgba(0, 113, 220, 0.15)";
  }

  return `
    <span class="channel-pill" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeColor}33;">
      <span>${displayName}</span>
    </span>
  `;
}

/**
 * InventoryTable Component (Phase 26: Prompt 27)
 * 
 * Invariants:
 * 1. Shows columns: SKU, Product, Warehouse, On Hand, Reserved, Available, Connected Channel Quantities, Status.
 * 2. Connected channel columns are dynamic: eBay and Walmart are NOT present when those integrations are not enabled.
 * 3. Available is derived dynamically: available = on_hand - reserved - safety_stock - allocated.
 * 4. Filters: channel, warehouse, low stock, mismatch, sync state, product, SKU.
 * 5. Uses explicit status semantics: LIVE, VERIFIED, STALE, CONFLICT, UNKNOWN.
 * 6. Never uses a green success state for data that has merely been submitted to a provider.
 */
export function renderInventoryTable(props: InventoryTableProps): string {
  const { items, connectedChannels, warehouses = [], activeFilters = {}, pagination } = props;

  // Active filters
  const currentSku = activeFilters.sku || "";
  const currentProduct = activeFilters.product || "";
  const currentWarehouse = activeFilters.warehouse || "";
  const currentChannel = activeFilters.channel || "";
  const currentSyncState = activeFilters.syncState || "all";
  const isLowStockActive = activeFilters.lowStock === "true";
  const isMismatchActive = activeFilters.mismatch === "true";

  // Filter Bar HTML
  const filterBarHtml = `
    <form class="inventory-filter-bar" id="inventoryFilterForm" method="GET" action="/app/inventory" role="search" aria-label="Inventory filters">
      <div class="filter-inputs-grid">
        <div class="filter-field">
          <label for="filterSku" class="filter-label">SKU</label>
          <input type="text" id="filterSku" name="sku" value="${escapeHtml(currentSku)}" placeholder="Filter by SKU..." class="filter-input" aria-label="Filter by SKU" />
        </div>
        <div class="filter-field">
          <label for="filterProduct" class="filter-label">Product</label>
          <input type="text" id="filterProduct" name="product" value="${escapeHtml(currentProduct)}" placeholder="Filter by Product..." class="filter-input" aria-label="Filter by Product" />
        </div>
        <div class="filter-field">
          <label for="filterWarehouse" class="filter-label">Warehouse</label>
          <select id="filterWarehouse" name="warehouse" class="filter-select" aria-label="Filter by Warehouse">
            <option value="" ${!currentWarehouse ? "selected" : ""}>All Warehouses</option>
            ${warehouses.map((w) => `
              <option value="${escapeHtml(w.id)}" ${currentWarehouse === w.id ? "selected" : ""}>${escapeHtml(w.name)}</option>
            `).join("")}
          </select>
        </div>
        <div class="filter-field">
          <label for="filterChannel" class="filter-label">Channel</label>
          <select id="filterChannel" name="channel" class="filter-select" aria-label="Filter by Channel">
            <option value="" ${!currentChannel ? "selected" : ""}>All Channels</option>
            ${connectedChannels.map((c) => `
              <option value="${escapeHtml(c.id)}" ${currentChannel === c.id ? "selected" : ""}>${escapeHtml(c.displayName)} (${escapeHtml(c.provider)})</option>
            `).join("")}
          </select>
        </div>
        <div class="filter-field">
          <label for="filterSyncState" class="filter-label">Sync State</label>
          <select id="filterSyncState" name="syncState" class="filter-select" aria-label="Filter by Sync State">
            <option value="all" ${currentSyncState === "all" ? "selected" : ""}>All States</option>
            <option value="LIVE" ${currentSyncState === "LIVE" ? "selected" : ""}>Live</option>
            <option value="VERIFIED" ${currentSyncState === "VERIFIED" ? "selected" : ""}>Verified</option>
            <option value="STALE" ${currentSyncState === "STALE" ? "selected" : ""}>Stale</option>
            <option value="CONFLICT" ${currentSyncState === "CONFLICT" ? "selected" : ""}>Conflict</option>
            <option value="UNKNOWN" ${currentSyncState === "UNKNOWN" ? "selected" : ""}>Unknown</option>
          </select>
        </div>
      </div>

      <div class="filter-toggles-row">
        <div class="filter-chips-group">
          <button type="button" 
                  id="filterLowStockToggle" 
                  class="filter-chip ${isLowStockActive ? 'active' : ''}" 
                  aria-pressed="${isLowStockActive}"
                  data-filter-toggle="lowStock">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Low Stock Only
          </button>
          <input type="hidden" name="lowStock" id="inputLowStock" value="${isLowStockActive ? 'true' : 'false'}" />

          <button type="button" 
                  id="filterMismatchToggle" 
                  class="filter-chip ${isMismatchActive ? 'active' : ''}" 
                  aria-pressed="${isMismatchActive}"
                  data-filter-toggle="mismatch">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Channel Mismatch Only
          </button>
          <input type="hidden" name="mismatch" id="inputMismatch" value="${isMismatchActive ? 'true' : 'false'}" />
        </div>

        <div class="filter-actions-group">
          <button type="submit" class="btn btn-secondary btn-sm" id="applyFiltersBtn">Apply Filters</button>
          <a href="/app/inventory" class="btn btn-ghost btn-sm" id="resetFiltersBtn">Clear Filters</a>
        </div>
      </div>
    </form>
  `;

  // Render Dynamic Connected Channels Header
  // Only render columns for connectedChannels that are currently enabled!
  const channelHeadersHtml = connectedChannels.map((channel) => `
    <th scope="col" class="th-channel" data-channel-id="${escapeHtml(channel.id)}">
      <div class="channel-header-cell">
        ${getChannelBadge(channel.provider, channel.displayName)}
        <span class="sub-header-label">Channel Stock</span>
      </div>
    </th>
  `).join("");

  // Table Body Rows
  let tbodyHtml = "";
  if (items.length === 0) {
    const totalColSpan = 7 + connectedChannels.length + 1; // SKU, Product, Warehouse, OnHand, Reserved, Available, Channels..., Status, Actions
    tbodyHtml = `
      <tr>
        <td colspan="${totalColSpan}" class="td-empty">
          <div class="empty-state-box" style="padding: 48px; text-align: center;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--color-surface-muted); margin-bottom: 12px;"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            <h4 style="margin: 0 0 8px 0; font-size: 16px;">No inventory records match filters</h4>
            <p style="margin: 0 0 16px 0; color: var(--color-surface-muted); font-size: 13px;">Adjust SKU, product, warehouse, or sync state filters to see inventory balances.</p>
            <a href="/app/inventory" class="btn btn-secondary btn-sm">Clear All Filters</a>
          </div>
        </td>
      </tr>
    `;
  } else {
    tbodyHtml = items.map((row) => {
      // Available stock health calculation
      let stockHealthClass = "stock-normal";
      let stockHealthLabel = "In Stock";
      if (row.available <= 0) {
        stockHealthClass = "stock-out";
        stockHealthLabel = row.available < 0 ? "Negative" : "Out of Stock";
      } else if (row.isLowStock || row.available <= row.safetyStock || row.available <= 10) {
        stockHealthClass = "stock-low";
        stockHealthLabel = "Low Stock";
      }

      // Render Dynamic Connected Channel Cells
      const channelCellsHtml = connectedChannels.map((channel) => {
        const channelQty = row.channelQuantities[channel.id] || row.channelQuantities[channel.provider.toLowerCase()] || row.channelQuantities[channel.provider];

        if (!channelQty) {
          return `
            <td class="td-channel-val" data-channel="${escapeHtml(channel.id)}">
              <span class="text-muted" title="Not mapped or listed on this channel">—</span>
            </td>
          `;
        }

        const isMismatch = channelQty.difference !== 0;
        const diffBadge = isMismatch ? `
          <span class="discrepancy-pill" style="font-size: 11px; padding: 1px 6px; border-radius: 4px; background: rgba(239,68,68,0.15); color: #ef4444; font-weight: 600;" title="Channel discrepancy: ${channelQty.difference > 0 ? '+' : ''}${channelQty.difference}">
            ${channelQty.difference > 0 ? '+' : ''}${channelQty.difference}
          </span>
        ` : "";

        // Status badge for channel
        const channelStatusBadge = renderStatusBadge({
          status: channelQty.syncState,
          category: "trust",
          size: "sm",
          showIcon: false,
        });

        return `
          <td class="td-channel-val" data-channel="${escapeHtml(channel.id)}">
            <div class="channel-cell-content" style="display: flex; align-items: center; gap: 6px;">
              <strong class="cell-external-qty">${channelQty.externalQuantity}</strong>
              ${diffBadge}
              ${channelStatusBadge}
            </div>
          </td>
        `;
      }).join("");

      // Overall Trust Badge
      const statusBadge = renderStatusBadge({
        status: row.status,
        category: "trust",
        size: "sm",
        pulsing: row.status === "LIVE",
      });

      return `
        <tr class="inventory-table-row ${row.hasMismatch ? 'row-mismatch' : ''} ${row.isLowStock ? 'row-low-stock' : ''}" id="inv-row-${escapeHtml(row.sku)}">
          <td class="td-sku">
            <button type="button" class="sku-inspect-link btn-link" data-open-sku="${escapeHtml(row.sku)}" title="Inspect SKU Detail">
              <code>${escapeHtml(row.sku)}</code>
            </button>
          </td>
          <td class="td-product">
            <span class="product-title-text" title="${escapeHtml(row.productTitle)}">${escapeHtml(row.productTitle)}</span>
          </td>
          <td class="td-warehouse">
            <span class="warehouse-pill">${escapeHtml(row.warehouseName)}</span>
          </td>
          <td class="td-num td-on-hand">
            <strong>${row.onHand}</strong>
          </td>
          <td class="td-num td-reserved">
            <span class="${row.reserved > 0 ? 'text-reserved' : 'text-muted'}">${row.reserved}</span>
          </td>
          <td class="td-num td-available">
            <div class="available-cell-wrap">
              <span class="available-number ${stockHealthClass}">${row.available}</span>
              <span class="stock-pill ${stockHealthClass}">${stockHealthLabel}</span>
            </div>
          </td>
          ${channelCellsHtml}
          <td class="td-status">
            ${statusBadge}
          </td>
          <td class="td-actions">
            <button type="button" 
                    class="btn btn-secondary btn-xs btn-inspect-sku" 
                    data-open-sku="${escapeHtml(row.sku)}" 
                    aria-label="Inspect details for SKU ${escapeHtml(row.sku)}">
              Inspect
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Pagination Footer HTML
  const startItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  const paginationHtml = `
    <div class="inventory-pagination-bar" role="navigation" aria-label="Inventory table pagination">
      <div class="pagination-info">
        Showing <span class="range-strong">${startItem}–${endItem}</span> of <span class="total-strong">${pagination.total}</span> items
      </div>
      <div class="pagination-controls">
        <button type="button" 
                class="btn btn-secondary btn-sm" 
                id="invPrevPageBtn" 
                ${!pagination.hasPrev ? "disabled aria-disabled='true'" : ""}
                data-goto-page="${pagination.page - 1}">
          &larr; Previous
        </button>
        <span class="page-indicator">Page <strong>${pagination.page}</strong> of <strong>${Math.max(1, pagination.totalPages)}</strong></span>
        <button type="button" 
                class="btn btn-secondary btn-sm" 
                id="invNextPageBtn" 
                ${!pagination.hasNext ? "disabled aria-disabled='true'" : ""}
                data-goto-page="${pagination.page + 1}">
          Next &rarr;
        </button>
      </div>
    </div>
  `;

  return `
    <div class="inventory-table-container" id="inventoryTableContainer">
      ${filterBarHtml}

      <div class="table-scroll-wrapper" role="region" aria-label="${props.ariaLabel || 'Multichannel Inventory Data Table'}" tabindex="0">
        <table class="inventory-data-table" id="inventoryMainTable">
          <thead>
            <tr>
              <th scope="col" class="th-sku">SKU</th>
              <th scope="col" class="th-product">Product</th>
              <th scope="col" class="th-warehouse">Warehouse</th>
              <th scope="col" class="th-on-hand">On Hand</th>
              <th scope="col" class="th-reserved">Reserved</th>
              <th scope="col" class="th-available">Available</th>
              ${channelHeadersHtml}
              <th scope="col" class="th-status">Status</th>
              <th scope="col" class="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tbodyHtml}
          </tbody>
        </table>
      </div>

      ${paginationHtml}
    </div>
  `;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
