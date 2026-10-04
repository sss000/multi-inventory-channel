import {
  SkuDetailDto,
} from "@platform/contracts";
import { renderStatusBadge } from "./status-badge.js";

export interface SkuDetailDrawerProps {
  id?: string;
  isOpen?: boolean;
  skuDetail?: SkuDetailDto | null;
  activeSection?: string;
  closeAriaLabel?: string;
}

/**
 * SkuDetailDrawer Component (Phase 26: Prompt 27)
 * 
 * Implements the 8 Canonical SKU Detail Sections:
 * 1. Summary
 * 2. Inventory by Warehouse
 * 3. Inventory by Channel
 * 4. Synchronization
 * 5. Exceptions
 * 6. Timeline (explainable causal audit)
 * 7. Orders
 * 8. Audit
 * 
 * Guarantees:
 * - Mathematical invariant explanation: available = on_hand - reserved - safety_stock - allocated
 * - Trust state semantics (LIVE, VERIFIED, STALE, CONFLICT, UNKNOWN)
 * - Never uses green success state for data merely submitted/queued
 * - WCAG-accessible dialog semantics with keyboard navigation
 */
export function renderSkuDetailDrawer(props: SkuDetailDrawerProps): string {
  const drawerId = props.id || "skuDetailDrawer";
  const isOpen = Boolean(props.isOpen && props.skuDetail);
  const detail = props.skuDetail;

  if (!isOpen || !detail) {
    return `
      <div class="sku-drawer-overlay drawer-closed" id="${drawerId}Overlay" hidden aria-hidden="true">
        <aside class="sku-drawer-panel" id="${drawerId}" role="dialog" aria-modal="true" aria-labelledby="skuDrawerTitle" tabindex="-1">
        </aside>
      </div>
    `;
  }

  const { summary } = detail;

  // Trust badge
  const trustBadge = renderStatusBadge({
    status: summary.trustState,
    category: "trust",
    size: "md",
    pulsing: summary.trustState === "LIVE",
  });

  // Section 1: Summary Cards & Equation
  const summarySectionHtml = `
    <section class="sku-section sku-summary-section" id="skuSectionSummary" aria-labelledby="headingSectionSummary">
      <div class="sku-summary-hero">
        <div class="sku-title-meta">
          <span class="sku-code-badge"><code>${escapeHtml(summary.sku)}</code></span>
          <h2 class="sku-product-title" id="skuDrawerTitle">${escapeHtml(summary.productTitle)}</h2>
          <div class="sku-meta-chips">
            ${summary.brand ? `<span class="meta-chip">Brand: <strong>${escapeHtml(summary.brand)}</strong></span>` : ""}
            ${summary.category ? `<span class="meta-chip">Category: <strong>${escapeHtml(summary.category)}</strong></span>` : ""}
            ${summary.barcode ? `<span class="meta-chip">Barcode: <code>${escapeHtml(summary.barcode)}</code></span>` : ""}
            <span class="meta-chip">Status: <strong>${escapeHtml(summary.status)}</strong></span>
            ${trustBadge}
          </div>
        </div>
      </div>

      <div class="inventory-equation-box" role="region" aria-label="Authoritative Ledger Balance Invariant">
        <div class="equation-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span class="equation-title">Authoritative Sellable Invariant Formula</span>
        </div>
        <div class="equation-formula">
          <span class="eq-term eq-avail"><strong>Available (${summary.totalAvailable})</strong></span>
          <span class="eq-op">=</span>
          <span class="eq-term">On Hand (${summary.totalOnHand})</span>
          <span class="eq-op">&minus;</span>
          <span class="eq-term">Reserved (${summary.totalReserved})</span>
          <span class="eq-op">&minus;</span>
          <span class="eq-term">Safety Stock (${summary.totalSafetyStock})</span>
          <span class="eq-op">&minus;</span>
          <span class="eq-term">Allocated (${summary.totalAllocated})</span>
        </div>
      </div>

      <div class="sku-metrics-grid">
        <div class="metric-card-sm available-card">
          <span class="metric-k">Available (Sellable)</span>
          <span class="metric-v-lg text-emerald">${summary.totalAvailable}</span>
          <span class="metric-sub">Pushed to connected channels</span>
        </div>
        <div class="metric-card-sm">
          <span class="metric-k">On Hand</span>
          <span class="metric-v-lg">${summary.totalOnHand}</span>
          <span class="metric-sub">Physically in warehouses</span>
        </div>
        <div class="metric-card-sm">
          <span class="metric-k">Reserved</span>
          <span class="metric-v-lg ${summary.totalReserved > 0 ? 'text-amber' : ''}">${summary.totalReserved}</span>
          <span class="metric-sub">Awaiting shipment</span>
        </div>
        <div class="metric-card-sm">
          <span class="metric-k">Safety Stock</span>
          <span class="metric-v-lg">${summary.totalSafetyStock}</span>
          <span class="metric-sub">Buffer threshold</span>
        </div>
        <div class="metric-card-sm">
          <span class="metric-k">Allocated</span>
          <span class="metric-v-lg">${summary.totalAllocated}</span>
          <span class="metric-sub">Pick & Pack staging</span>
        </div>
      </div>
    </section>
  `;

  // Section 2: Inventory by Warehouse
  const totalWhOnHand = detail.inventoryByWarehouse.reduce((acc, w) => acc + w.onHand, 0);
  const totalWhReserved = detail.inventoryByWarehouse.reduce((acc, w) => acc + w.reserved, 0);
  const totalWhAllocated = detail.inventoryByWarehouse.reduce((acc, w) => acc + w.allocated, 0);
  const totalWhAvailable = detail.inventoryByWarehouse.reduce((acc, w) => acc + w.available, 0);

  const warehouseRowsHtml = detail.inventoryByWarehouse.map((w) => `
    <tr>
      <td><strong>${escapeHtml(w.warehouseName)}</strong></td>
      <td class="text-right"><strong>${w.onHand}</strong></td>
      <td class="text-right ${w.reserved > 0 ? 'text-amber' : 'text-muted'}">${w.reserved}</td>
      <td class="text-right text-muted">${w.allocated}</td>
      <td class="text-right"><strong class="text-emerald">${w.available}</strong></td>
      <td class="text-right text-muted">${w.safetyStock}</td>
      <td class="text-right text-muted"><small>${escapeHtml(w.updatedAt)}</small></td>
    </tr>
  `).join("");

  const warehouseSectionHtml = `
    <section class="sku-section" id="skuSectionWarehouses" aria-labelledby="headingSectionWarehouses">
      <h3 class="sku-section-heading" id="headingSectionWarehouses">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Inventory by Warehouse
      </h3>
      <table class="detail-sub-table">
        <thead>
          <tr>
            <th>Warehouse</th>
            <th class="text-right">On Hand</th>
            <th class="text-right">Reserved</th>
            <th class="text-right">Allocated</th>
            <th class="text-right">Available</th>
            <th class="text-right">Safety Stock</th>
            <th class="text-right">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          ${warehouseRowsHtml || `<tr><td colspan="7" class="text-center text-muted">No warehouse balances found.</td></tr>`}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td><strong>Total</strong></td>
            <td class="text-right"><strong>${totalWhOnHand}</strong></td>
            <td class="text-right"><strong>${totalWhReserved}</strong></td>
            <td class="text-right"><strong>${totalWhAllocated}</strong></td>
            <td class="text-right"><strong>${totalWhAvailable}</strong></td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </section>
  `;

  // Section 3: Inventory by Channel
  const channelRowsHtml = detail.inventoryByChannel.map((ch) => {
    const chBadge = renderStatusBadge({
      status: ch.syncState,
      category: "trust",
      size: "sm",
    });

    const isMismatch = ch.difference !== 0;
    const diffDisplay = isMismatch ? `
      <span class="diff-chip ${ch.difference < 0 ? 'diff-neg' : 'diff-pos'}">
        ${ch.difference > 0 ? '+' : ''}${ch.difference}
      </span>
    ` : `<span class="text-muted">0</span>`;

    return `
      <tr>
        <td>
          <div style="display: flex; flex-direction: column;">
            <strong>${escapeHtml(ch.channelDisplayName)}</strong>
            <small class="text-muted">${escapeHtml(ch.provider)}</small>
          </div>
        </td>
        <td class="text-right"><strong>${ch.currentQuantity}</strong></td>
        <td class="text-right">${ch.internalQuantity}</td>
        <td class="text-right">${diffDisplay}</td>
        <td>${chBadge}</td>
        <td class="text-right text-muted"><small>${ch.lastVerifiedAt || 'Never'}</small></td>
      </tr>
    `;
  }).join("");

  const channelSectionHtml = `
    <section class="sku-section" id="skuSectionChannels" aria-labelledby="headingSectionChannels">
      <h3 class="sku-section-heading" id="headingSectionChannels">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        Inventory by Channel
      </h3>
      <table class="detail-sub-table">
        <thead>
          <tr>
            <th>Channel</th>
            <th class="text-right">External Qty</th>
            <th class="text-right">Internal Available</th>
            <th class="text-right">Difference</th>
            <th>Sync State</th>
            <th class="text-right">Last Verified</th>
          </tr>
        </thead>
        <tbody>
          ${channelRowsHtml || `<tr><td colspan="6" class="text-center text-muted">No connected channels for this SKU.</td></tr>`}
        </tbody>
      </table>
    </section>
  `;

  // Section 4: Synchronization
  const syncRowsHtml = detail.synchronization.map((s) => {
    // Invariant check: Do not use green success state for data merely submitted or in-progress!
    const syncBadge = renderStatusBadge({
      status: s.status,
      category: "sync",
      size: "sm",
    });

    return `
      <tr>
        <td><code>${escapeHtml(s.jobId.slice(0, 8))}...</code></td>
        <td><strong>${escapeHtml(s.channel)}</strong></td>
        <td><span class="dir-badge dir-${s.direction.toLowerCase()}">${s.direction}</span></td>
        <td><code>${escapeHtml(s.operation)}</code></td>
        <td class="text-right">${s.quantitySent !== undefined ? s.quantitySent : '—'}</td>
        <td class="text-right">${s.verifiedQuantity !== undefined ? s.verifiedQuantity : '—'}</td>
        <td>${syncBadge}</td>
        <td class="text-right text-muted"><small>${s.latencyMs !== undefined ? `${s.latencyMs}ms` : '—'}</small></td>
        <td class="text-right text-muted"><small>${escapeHtml(s.timestamp)}</small></td>
      </tr>
    `;
  }).join("");

  const syncSectionHtml = `
    <section class="sku-section" id="skuSectionSync" aria-labelledby="headingSectionSync">
      <h3 class="sku-section-heading" id="headingSectionSync">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Synchronization History
      </h3>
      <table class="detail-sub-table">
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Channel</th>
            <th>Direction</th>
            <th>Operation</th>
            <th class="text-right">Sent</th>
            <th class="text-right">Verified</th>
            <th>Status</th>
            <th class="text-right">Latency</th>
            <th class="text-right">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${syncRowsHtml || `<tr><td colspan="9" class="text-center text-muted">No synchronization records.</td></tr>`}
        </tbody>
      </table>
    </section>
  `;

  // Section 5: Exceptions
  const exceptionsHtml = detail.exceptions.length === 0 ? `
    <div class="empty-exceptions-box">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      <span>No active exceptions or drift detected for this SKU.</span>
    </div>
  ` : detail.exceptions.map((ex) => {
    const sevBadge = renderStatusBadge({
      status: ex.severity,
      category: "severity",
      size: "sm",
    });

    return `
      <div class="exception-item-card ex-sev-${ex.severity.toLowerCase()}">
        <div class="ex-card-header">
          <div class="ex-card-title-group">
            ${sevBadge}
            <span class="ex-type-code"><code>${escapeHtml(ex.type)}</code></span>
            <strong class="ex-title">${escapeHtml(ex.title)}</strong>
          </div>
          <span class="ex-status-pill status-${ex.status.toLowerCase()}">${ex.status}</span>
        </div>
        ${ex.difference !== undefined ? `<div class="ex-diff-row">Discrepancy: <strong>${ex.difference > 0 ? '+' : ''}${ex.difference} units</strong></div>` : ""}
        ${ex.suggestedAction ? `<div class="ex-action-row"><strong>Recommended Action:</strong> ${escapeHtml(ex.suggestedAction)}</div>` : ""}
        <div class="ex-card-footer">
          <small class="text-muted">Detected at ${escapeHtml(ex.createdAt)}</small>
        </div>
      </div>
    `;
  }).join("");

  const exceptionsSectionHtml = `
    <section class="sku-section" id="skuSectionExceptions" aria-labelledby="headingSectionExceptions">
      <h3 class="sku-section-heading" id="headingSectionExceptions">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Exceptions & Discrepancies
      </h3>
      <div class="exceptions-list">
        ${exceptionsHtml}
      </div>
    </section>
  `;

  // Section 6: Timeline (Explainable Inventory)
  const timelineItemsHtml = detail.timeline.map((evt) => {
    const isPositive = evt.quantityDelta > 0;
    const isNegative = evt.quantityDelta < 0;
    const sign = isPositive ? "+" : "";
    const deltaClass = isPositive ? "delta-pos" : isNegative ? "delta-neg" : "delta-neutral";

    return `
      <li class="explainable-timeline-node" id="tl-node-${escapeHtml(evt.id)}">
        <div class="tl-node-icon" aria-hidden="true"></div>
        <div class="tl-node-body">
          <div class="tl-node-header">
            <span class="tl-timestamp"><time datetime="${escapeHtml(evt.timestamp)}">${escapeHtml(evt.timestamp)}</time></span>
            <strong class="tl-title">${escapeHtml(evt.title)}</strong>
            <span class="tl-delta-chip ${deltaClass}">${sign}${evt.quantityDelta}</span>
            <span class="tl-channel-badge">${escapeHtml(evt.channelOrWarehouse)}</span>
            <span class="tl-actor">by <em>${escapeHtml(evt.actor)}</em> (${escapeHtml(evt.actorType)})</span>
          </div>

          <div class="tl-transition-row">
            <span class="transition-segment">On Hand: <code>${evt.beforeOnHand} &rarr; ${evt.afterOnHand}</code></span>
            <span class="stat-sep">&middot;</span>
            <span class="transition-segment">Available: <code>${evt.beforeAvailable} &rarr; ${evt.afterAvailable}</code></span>
          </div>

          ${evt.reason ? `<p class="tl-reason-desc">${escapeHtml(evt.reason)}</p>` : ""}

          <div class="tl-causal-evidence">
            <span class="evidence-k">Correlation ID:</span> <code>${escapeHtml(evt.correlationId)}</code>
            ${evt.causalChain && evt.causalChain.length > 0 ? `
              <div class="causal-chain-trail" title="Causal Traversal Path">
                <span class="chain-label">Causal Path:</span>
                ${evt.causalChain.map((step) => `<span class="chain-step">${escapeHtml(step)}</span>`).join("<span class='chain-sep'>&rarr;</span>")}
              </div>
            ` : ""}
          </div>
        </div>
      </li>
    `;
  }).join("");

  const timelineSectionHtml = `
    <section class="sku-section" id="skuSectionTimeline" aria-labelledby="headingSectionTimeline">
      <h3 class="sku-section-heading" id="headingSectionTimeline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Explainable Inventory Timeline
      </h3>
      <p class="section-hint">Causal ledger audit trail explaining every material quantity transition and reservation.</p>
      <ol class="explainable-timeline-spine">
        ${timelineItemsHtml || `<li class="text-muted">No timeline events recorded for this SKU.</li>`}
      </ol>
    </section>
  `;

  // Section 7: Orders
  const orderRowsHtml = detail.orders.map((ord) => `
    <tr>
      <td><strong>${escapeHtml(ord.orderNumber)}</strong></td>
      <td>${escapeHtml(ord.channel)}</td>
      <td>${ord.customer ? escapeHtml(ord.customer) : '<span class="text-muted">—</span>'}</td>
      <td><span class="order-status-pill status-${ord.status.toLowerCase()}">${ord.status}</span></td>
      <td class="text-right"><strong>${ord.quantityReserved}</strong></td>
      <td class="text-right text-muted"><small>${escapeHtml(ord.reservedAt)}</small></td>
    </tr>
  `).join("");

  const ordersSectionHtml = `
    <section class="sku-section" id="skuSectionOrders" aria-labelledby="headingSectionOrders">
      <h3 class="sku-section-heading" id="headingSectionOrders">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        Active Orders & Reservations
      </h3>
      <table class="detail-sub-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Channel</th>
            <th>Customer</th>
            <th>Status</th>
            <th class="text-right">Reserved Qty</th>
            <th class="text-right">Reserved At</th>
          </tr>
        </thead>
        <tbody>
          ${orderRowsHtml || `<tr><td colspan="6" class="text-center text-muted">No active orders or reservations for this SKU.</td></tr>`}
        </tbody>
      </table>
    </section>
  `;

  // Section 8: Audit
  const auditRowsHtml = detail.audit.map((aud) => `
    <tr>
      <td><small>${escapeHtml(aud.timestamp)}</small></td>
      <td><strong>${escapeHtml(aud.actor)}</strong></td>
      <td><code>${escapeHtml(aud.action)}</code></td>
      <td>${aud.reason ? escapeHtml(aud.reason) : '<span class="text-muted">—</span>'}</td>
      <td><code>${escapeHtml(aud.correlationId.slice(0, 8))}...</code></td>
    </tr>
  `).join("");

  const auditSectionHtml = `
    <section class="sku-section" id="skuSectionAudit" aria-labelledby="headingSectionAudit">
      <h3 class="sku-section-heading" id="headingSectionAudit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>
        Immutable Audit Trail
      </h3>
      <table class="detail-sub-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Reason</th>
            <th>Correlation ID</th>
          </tr>
        </thead>
        <tbody>
          ${auditRowsHtml || `<tr><td colspan="5" class="text-center text-muted">No audit events recorded.</td></tr>`}
        </tbody>
      </table>
    </section>
  `;

  // Section Tabs Navigation Bar
  const sectionNavHtml = `
    <nav class="sku-drawer-nav" aria-label="SKU Detail Sections">
      <a href="#skuSectionSummary" class="drawer-nav-item active">Summary</a>
      <a href="#skuSectionWarehouses" class="drawer-nav-item">Warehouses</a>
      <a href="#skuSectionChannels" class="drawer-nav-item">Channels</a>
      <a href="#skuSectionSync" class="drawer-nav-item">Synchronization</a>
      <a href="#skuSectionExceptions" class="drawer-nav-item">Exceptions</a>
      <a href="#skuSectionTimeline" class="drawer-nav-item">Timeline</a>
      <a href="#skuSectionOrders" class="drawer-nav-item">Orders</a>
      <a href="#skuSectionAudit" class="drawer-nav-item">Audit</a>
    </nav>
  `;

  return `
    <div class="sku-drawer-overlay drawer-open" id="${drawerId}Overlay" data-drawer-id="${drawerId}">
      <aside class="sku-drawer-panel" id="${drawerId}" role="dialog" aria-modal="true" aria-labelledby="skuDrawerTitle" tabindex="-1">
        <header class="sku-drawer-header">
          <div class="drawer-header-left">
            <span class="drawer-eyebrow">SKU Investigation & Control</span>
            <span class="drawer-sku-title"><code>${escapeHtml(summary.sku)}</code></span>
          </div>
          <button type="button" class="drawer-close-btn" id="skuDrawerCloseBtn" aria-label="${props.closeAriaLabel || 'Close SKU Detail Drawer'}" data-close-drawer="${drawerId}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        ${sectionNavHtml}

        <div class="sku-drawer-body">
          ${summarySectionHtml}
          ${warehouseSectionHtml}
          ${channelSectionHtml}
          ${syncSectionHtml}
          ${exceptionsSectionHtml}
          ${timelineSectionHtml}
          ${ordersSectionHtml}
          ${auditSectionHtml}
        </div>
      </aside>
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
