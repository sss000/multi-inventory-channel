/**
 * Discrepancy Table & Source-of-Truth Selection Component
 * Canonical Specifications: Section 63, 64 of 01_ENGINEERING_SPEC.md & Prompt 26
 * 
 * Invariants:
 * 1. UI must show the discrepancy clearly (e.g., Internal = 20, Shopify = 20, Amazon = 18).
 * 2. It must NOT silently overwrite Amazon or any channel.
 * 3. Provide explicit source-of-truth selection.
 * 4. Require explicit confirmation before enabling outbound sync.
 */

import { renderStatusBadge } from "./status-badge.js";

export interface DiscrepancyRow {
  sku: string;
  productTitle: string;
  internalQuantity: number;
  channelQuantities: Record<string, number>;
  discrepancy: boolean;
  chosenSourceOfTruth?: "INTERNAL_LEDGER" | "CHANNEL" | "CUSTOM";
  sourceChannelProvider?: string;
  resolvedQuantity?: number;
  confirmed: boolean;
}

export interface DiscrepancyTableProps {
  rows: DiscrepancyRow[];
  channels: string[]; // e.g. ["Shopify", "Amazon"]
  onResolveUrlPrefix?: string;
  canConfirm?: boolean;
}

export function renderDiscrepancyTable(props: DiscrepancyTableProps): string {
  const { rows, channels } = props;

  const headerChannels = channels
    .map((c) => `<th scope="col" style="text-align: right; padding: var(--space-3) var(--space-4);">${c}</th>`)
    .join("");

  const rowsHtml = rows
    .map((row) => {
      const channelCells = channels
        .map((c) => {
          const qty = row.channelQuantities[c.toUpperCase()] ?? row.channelQuantities[c] ?? "—";
          const isDifferentFromInternal = typeof qty === "number" && qty !== row.internalQuantity;
          const cellColor = isDifferentFromInternal ? "color: var(--color-warning-dark); font-weight: 600;" : "";
          return `<td style="text-align: right; padding: var(--space-3) var(--space-4); ${cellColor}">${qty}</td>`;
        })
        .join("");

      const statusBadge = row.discrepancy
        ? renderStatusBadge({ status: "CONFLICT", label: "Discrepancy Detected" })
        : renderStatusBadge({ status: "VERIFIED", label: "Consistent" });

      const resolvedText = row.confirmed && row.resolvedQuantity !== undefined
        ? `<span class="badge badge-success" style="font-size: var(--text-2xs);">Resolved: ${row.resolvedQuantity} units (${row.chosenSourceOfTruth})</span>`
        : `<span class="badge badge-warning" style="font-size: var(--text-2xs);">Action Required</span>`;

      return `
        <tr class="discrepancy-row ${row.discrepancy ? 'row-discrepancy' : 'row-matched'}" data-sku="${row.sku}">
          <td style="padding: var(--space-3) var(--space-4);">
            <div style="font-weight: 600; font-family: monospace;">${row.sku}</div>
            <div style="font-size: var(--text-xs); color: var(--color-text-secondary);">${row.productTitle}</div>
          </td>
          <td style="text-align: right; padding: var(--space-3) var(--space-4); font-weight: 600;">
            ${row.internalQuantity}
          </td>
          ${channelCells}
          <td style="padding: var(--space-3) var(--space-4); text-align: center;">
            ${statusBadge}
          </td>
          <td style="padding: var(--space-3) var(--space-4);">
            ${
              row.discrepancy
                ? `
                <div class="source-of-truth-selector" style="display: flex; flex-direction: column; gap: 4px;">
                  <select class="form-select form-select-sm sot-select" data-sku="${row.sku}" aria-label="Source of Truth for ${row.sku}">
                    <option value="INTERNAL_LEDGER" ${row.chosenSourceOfTruth === 'INTERNAL_LEDGER' ? 'selected' : ''}>Internal Ledger (${row.internalQuantity} units)</option>
                    ${channels.map(c => {
                      const q = row.channelQuantities[c.toUpperCase()] ?? row.channelQuantities[c] ?? 0;
                      return `<option value="CHANNEL_${c.toUpperCase()}" ${row.sourceChannelProvider === c.toUpperCase() ? 'selected' : ''}>${c} (${q} units)</option>`;
                    }).join("")}
                    <option value="CUSTOM" ${row.chosenSourceOfTruth === 'CUSTOM' ? 'selected' : ''}>Custom Physical Count...</option>
                  </select>
                  <div>${resolvedText}</div>
                </div>
              `
                : `<span style="color: var(--color-success); font-size: var(--text-xs);">✓ Aligned (${row.internalQuantity} units)</span>`
            }
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="discrepancy-table-container">
      <div class="callout callout-warning" style="margin-bottom: var(--space-4); padding: var(--space-4); border-left: 4px solid var(--color-warning); background: var(--color-warning-light); border-radius: 4px;">
        <h4 style="margin: 0 0 6px 0; font-size: var(--text-sm); font-weight: 700; color: var(--color-warning-dark);">
          🛡️ CRITICAL INITIAL SYNC SAFETY GUARANTEE
        </h4>
        <p style="margin: 0; font-size: var(--text-xs); line-height: 1.5; color: var(--color-text-primary);">
          Connected channels will <strong>never</strong> be automatically overwritten until you review differences and confirm your authoritative source of truth. Choose which count to keep for each SKU before enabling outbound synchronization.
        </p>
      </div>

      <div class="table-responsive" style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden;">
        <table class="table" style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);" aria-label="Inventory Baseline Differences">
          <thead style="background: var(--color-bg-secondary); border-bottom: 2px solid var(--color-border);">
            <tr>
              <th scope="col" style="text-align: left; padding: var(--space-3) var(--space-4);">SKU & Product</th>
              <th scope="col" style="text-align: right; padding: var(--space-3) var(--space-4);">Internal Ledger</th>
              ${headerChannels}
              <th scope="col" style="text-align: center; padding: var(--space-3) var(--space-4);">Comparison</th>
              <th scope="col" style="text-align: left; padding: var(--space-3) var(--space-4);">Authoritative Source of Truth</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
