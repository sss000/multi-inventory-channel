/**
 * Outbound Sync Confirmation Guardrail Component
 * Canonical Specifications: Section 63 of 01_ENGINEERING_SPEC.md & Prompt 26
 *
 * Mandatory requirement:
 * Outbound synchronization CANNOT be enabled until differences are reviewed and the user explicitly confirms.
 */

export interface SyncConfirmationProps {
  unresolvedCount: number;
  totalSkusCount: number;
  onConfirmActionUrl?: string;
  isConfirmed?: boolean;
}

export function renderSyncConfirmationCard(props: SyncConfirmationProps): string {
  const { unresolvedCount, totalSkusCount, isConfirmed } = props;
  const isBlocked = unresolvedCount > 0;

  return `
    <div class="card sync-confirmation-card p-6" style="border: 2px solid ${isBlocked ? 'var(--color-danger)' : 'var(--color-primary)'}; border-radius: var(--radius-lg); background: var(--color-bg-surface);">
      <div style="display: flex; align-items: flex-start; gap: var(--space-4);">
        <div style="font-size: 2rem;">
          ${isBlocked ? '⚠️' : '🔒'}
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0 0 var(--space-2) 0; font-size: var(--text-base); font-weight: 700;">
            ${isBlocked ? 'Outbound Synchronization Blocked' : 'Authorize Outbound Synchronization'}
          </h3>
          <p style="margin: 0 0 var(--space-4) 0; font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.5;">
            ${
              isBlocked
                ? `You have <strong>${unresolvedCount} unresolved inventory differences</strong>. In order to protect your external channel listings from unintended overwrites, outbound synchronization cannot be enabled until you explicitly choose a source of truth for each SKU.`
                : `All <strong>${totalSkusCount} SKUs</strong> have confirmed sources of truth. Enabling outbound synchronization will push authoritative inventory balances to connected marketplaces whenever local sales or adjustments occur.`
            }
          </p>

          ${
            isBlocked
              ? `
              <div class="alert alert-danger" style="margin-bottom: var(--space-4); padding: var(--space-3); font-size: var(--text-xs);">
                <strong>Action Required:</strong> Resolve all ${unresolvedCount} discrepancies in Step 7 before continuing.
              </div>
              <button class="btn btn-secondary" disabled style="opacity: 0.5; cursor: not-allowed;">
                Outbound Sync Blocked (Pending Resolutions)
              </button>
            `
              : `
              <form class="sync-confirm-form" method="POST" action="${props.onConfirmActionUrl || '/api/v1/onboarding/enable-sync'}">
                <div style="margin-bottom: var(--space-4); display: flex; align-items: flex-start; gap: var(--space-2);">
                  <input type="checkbox" id="confirm-sync-checkbox" name="confirmed" value="true" required style="margin-top: 3px;" ${isConfirmed ? 'checked' : ''} />
                  <label for="confirm-sync-checkbox" style="font-size: var(--text-xs); color: var(--color-text-primary); cursor: pointer;">
                    <strong>I confirm that all inventory counts have been validated.</strong> I authorize the platform to push updates to connected channels and understand that downstream marketplaces will be aligned with the confirmed authoritative counts.
                  </label>
                </div>
                <button type="submit" class="btn btn-primary" id="btn-enable-outbound-sync">
                  Enable Outbound Synchronization & Complete Onboarding →
                </button>
              </form>
            `
          }
        </div>
      </div>
    </div>
  `;
}
