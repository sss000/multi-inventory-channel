import { TrustState } from "@platform/domain";
import { renderStatusBadge } from "./status-badge.js";

export interface InventoryCellProps {
  available: number;
  onHand: number;
  reserved: number;
  safetyStock?: number;
  allocated?: number;
  damaged?: number;
  quarantined?: number;
  trustState: TrustState;
  lastVerifiedAt?: string;
  compact?: boolean;
  warnings?: string[];
  sku?: string;
}

/**
 * InventoryCell: Displays authoritative ledger inventory balances and mathematical breakdown.
 * In accordance with Section 9.1 & Section 14 of 03_FRONTEND_SPEC.md:
 * Never present available quantity without exposing the ledger invariant breakdown:
 * available = on_hand - reserved - safety_stock - damaged - quarantined - allocated
 */
export function renderInventoryCell(props: InventoryCellProps): string {
  const safetyStock = props.safetyStock || 0;
  const allocated = props.allocated || 0;
  const damaged = props.damaged || 0;
  const quarantined = props.quarantined || 0;

  // Determine stock health
  let stockHealthClass = "stock-normal";
  let stockHealthLabel = "In Stock";
  if (props.available <= 0) {
    stockHealthClass = "stock-out";
    stockHealthLabel = props.available < 0 ? "Negative Stock" : "Out of Stock";
  } else if (props.available <= 10) {
    stockHealthClass = "stock-low";
    stockHealthLabel = "Low Stock";
  }

  const trustBadge = renderStatusBadge({
    status: props.trustState,
    category: "trust",
    size: "sm"
  });

  if (props.compact) {
    return `
      <div class="inventory-cell compact ${stockHealthClass}" title="Available: ${props.available} (On Hand: ${props.onHand}, Reserved: ${props.reserved})">
        <span class="cell-available-num">${props.available}</span>
        <span class="cell-trust-indicator">${trustBadge}</span>
      </div>
    `;
  }

  return `
    <div class="inventory-cell ${stockHealthClass}" role="region" aria-label="Inventory Balance for ${props.sku || 'item'}">
      <div class="cell-primary-row">
        <div class="available-group">
          <span class="available-value">${props.available}</span>
          <span class="available-label">Available</span>
        </div>
        <div class="cell-badges">
          <span class="stock-health-pill ${stockHealthClass}">${stockHealthLabel}</span>
          ${trustBadge}
        </div>
      </div>

      <div class="cell-breakdown-row" title="Authoritative Ledger Balance Invariant">
        <span class="breakdown-stat" title="Total physically present in warehouse">
          <span class="stat-k">On Hand:</span> <strong class="stat-v">${props.onHand}</strong>
        </span>
        <span class="stat-sep">·</span>
        <span class="breakdown-stat" title="Reserved by active orders awaiting shipment">
          <span class="stat-k">Reserved:</span> <span class="stat-v">${props.reserved}</span>
        </span>
        ${safetyStock > 0 ? `
          <span class="stat-sep">·</span>
          <span class="breakdown-stat" title="Configured buffer threshold">
            <span class="stat-k">Safety:</span> <span class="stat-v">${safetyStock}</span>
          </span>
        ` : ''}
        ${allocated > 0 ? `
          <span class="stat-sep">·</span>
          <span class="breakdown-stat" title="Allocated to picking/staging">
            <span class="stat-k">Alloc:</span> <span class="stat-v">${allocated}</span>
          </span>
        ` : ''}
      </div>

      ${props.lastVerifiedAt ? `
        <div class="cell-freshness-row">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span class="freshness-text">Verified: ${props.lastVerifiedAt}</span>
        </div>
      ` : ''}
    </div>
  `;
}
