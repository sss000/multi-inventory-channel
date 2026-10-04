import { renderStatusBadge } from "./status-badge.js";

export interface IntegrationCardAction {
  id: string;
  label: string;
  href?: string;
  onClick?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export interface IntegrationCardProps {
  id: string;
  channelType: "shopify" | "amazon" | "ebay" | "walmart" | "custom" | string;
  channelName: string;
  accountIdentifier?: string;
  status: "ACTIVE" | "INACTIVE" | "ERROR" | "SYNCING" | "DISCONNECTED" | string;
  syncHealth?: "HEALTHY" | "DEGRADED" | "FAILING" | string;
  lastSyncAt?: string;
  skuCount?: number;
  errorCount?: number;
  actions?: IntegrationCardAction[];
}

export const CHANNEL_LOGOS: Record<string, string> = {
  shopify: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#95BF47"><path d="M19.78 6.55c-.05-.4-.38-.68-.78-.68-.04 0-1.87-.04-1.87-.04s-1.25-1.24-1.39-1.38c-.37-.37-.92-.51-1.42-.37L13.2 4.4C13.04 3.93 12.75 3.32 12.24 3c-.93-.6-2.18-.32-2.88.36-.5.48-.82 1.14-.94 1.83L6.15 5.86c-.53.15-.9.62-.92 1.17L5 19.34c0 .35.2.68.52.84l7.15 3.58c.21.11.45.16.69.16.24 0 .48-.05.69-.16l7.15-3.58c.32-.16.52-.49.52-.84L21.72 7.2l-1.94-.65zM11.66 4.77c.33-.32.74-.43 1.1-.38-.17.43-.44 1.1-.79 1.74l-1.32.39c.14-.72.46-1.35 1.01-1.75zm-1.8 3.03l1.83-.54c-.38.74-.91 1.71-1.6 2.55l-.23-2.01zm-3.23.96l2.12-.63.26 2.31c-.8.95-1.84 1.9-2.38 2.21v-3.89zm6.05 13.56l-6.04-3.02.04-7.91c.71-.48 2.01-1.64 2.92-2.73.49-.59.95-1.29 1.33-1.97l2.25-.66v15.29l-.5.5c0 .25 0 .25 0 0zm1.32-.5l-.5-.5V8.16l4.7 1.4v8.86l-4.2 2.1zm5.52-3.14l-4.2 2.1V9.92l4.2-1.26v8.66z"/></svg>`,
  amazon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#FF9900"><path d="M13.9 14.8c-2.3 1.7-5.7 2.6-8.6 2.6-4.1 0-7.7-1.5-10.5-4-.2-.2 0-.5.2-.3 3.1 1.8 6.9 2.8 10.7 2.8 2.6 0 5.4-.6 8-1.7.4-.2.7.2.2.6zm2.4-1.2c-.3-.4-1.9-.2-2.6-.1-.2 0-.3-.2-.1-.3 1.1-.9 2.9-.6 3.2-.2.3.4.1 2.3-.9 3.2-.2.1-.3 0-.3-.1.2-.7.9-2.1.7-2.5zm-5.1-4.7c0 1.5-.2 2.6-.8 3.5-.5.8-1.4 1.2-2.4 1.2-1.3 0-2.1-.9-2.1-2.4 0-2.8 2.2-3.3 5.3-3.3v1zm2.3 5.9h-2.1v-1.1c-.6.8-1.5 1.3-2.7 1.3-1.9 0-3.3-1.3-3.3-3.4 0-1.8 1-3.1 2.6-3.7 1.4-.5 3.3-.6 5.5-.7v-.4c0-.7-.2-1.3-.7-1.6-.5-.4-1.3-.5-2.2-.5-1.5 0-2.9.4-4 1.2-.2.1-.3 0-.3-.2l-.4-1.1c-.1-.2 0-.3.2-.5 1.4-.9 3.1-1.4 5.1-1.4 1.6 0 2.9.4 3.7 1.2.9.9 1.1 2.2 1.1 4.1v4.5c0 .7.1 1.2.2 1.5 0 .2-.1.3-.3.3h-2.1c-.2-.1-.3-.3-.4-.7z"/></svg>`,
  ebay: `<svg width="24" height="24" viewBox="0 0 24 24"><text x="2" y="18" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#E53238">e<tspan fill="#0064D2">b</tspan><tspan fill="#F5AF02">a</tspan><tspan fill="#86B817">y</tspan></text></svg>`,
  walmart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#0071DC"><path d="M12 2.5a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-3 0V4a1.5 1.5 0 0 1 1.5-1.5zm0 13a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-3 0V17a1.5 1.5 0 0 1 1.5-1.5zm8.2-7.3a1.5 1.5 0 0 1 .4 2.1l-3 3a1.5 1.5 0 1 1-2.1-2.1l3-3a1.5 1.5 0 0 1 2.1 0zm-11.3 6.5a1.5 1.5 0 0 1 .4 2.1l-3 3a1.5 1.5 0 0 1-2.1-2.1l3-3a1.5 1.5 0 0 1 2.1 0zm11.3 2.1a1.5 1.5 0 0 1-2.1 0l-3-3a1.5 1.5 0 1 1 2.1-2.1l3 3a1.5 1.5 0 0 1 0 2.1zM6.8 8.2a1.5 1.5 0 0 1-2.1 0l-3-3a1.5 1.5 0 0 1 2.1-2.1l3 3a1.5 1.5 0 0 1 0 2.1z"/></svg>`,
  custom: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><polyline points="2 10 12 16 22 10"/></svg>`
};

/**
 * IntegrationCard: Visual component for channel connection management,
 * sync status telemetry, and account health.
 */
export function renderIntegrationCard(props: IntegrationCardProps): string {
  const channelTypeKey = props.channelType.toLowerCase();
  const logoSvg = CHANNEL_LOGOS[channelTypeKey] || CHANNEL_LOGOS["custom"];
  
  const statusBadge = renderStatusBadge({
    status: props.status,
    category: "sync",
    size: "sm"
  });

  let healthColor = "#10b981";
  if (props.syncHealth === "DEGRADED") healthColor = "#f59e0b";
  if (props.syncHealth === "FAILING") healthColor = "#ef4444";

  const actionsHtml = (props.actions || [
    { id: "sync", label: "Sync Now", variant: "primary" },
    { id: "settings", label: "Configure", variant: "secondary" }
  ]).map(action => `
    <button class="btn btn-${action.variant || 'secondary'} btn-sm integration-action-btn"
            data-action="${action.id}"
            data-channel-id="${props.id}">
      ${action.label}
    </button>
  `).join("");

  return `
    <article class="integration-card" id="channel-${props.id}" role="article" aria-labelledby="channel-name-${props.id}">
      <div class="integration-card-header">
        <div class="channel-brand-row">
          <div class="channel-logo-wrapper" aria-hidden="true">
            ${logoSvg}
          </div>
          <div class="channel-info">
            <h4 class="channel-title" id="channel-name-${props.id}">${props.channelName}</h4>
            <span class="channel-account-id">${props.accountIdentifier || props.channelType}</span>
          </div>
        </div>
        <div class="channel-status-wrapper">
          ${statusBadge}
        </div>
      </div>

      <div class="integration-card-stats">
        <div class="card-stat">
          <span class="stat-label">Mapped SKUs</span>
          <span class="stat-number">${props.skuCount !== undefined ? props.skuCount.toLocaleString() : '—'}</span>
        </div>
        <div class="card-stat">
          <span class="stat-label">Health</span>
          <span class="stat-number stat-health" style="color: ${healthColor};">
            <span class="health-dot" style="background-color: ${healthColor};"></span>
            ${props.syncHealth || "HEALTHY"}
          </span>
        </div>
        <div class="card-stat">
          <span class="stat-label">Last Sync</span>
          <span class="stat-number stat-time">${props.lastSyncAt || "Never"}</span>
        </div>
      </div>

      ${props.errorCount && props.errorCount > 0 ? `
        <div class="integration-error-alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>${props.errorCount} synchronization errors pending resolution</span>
        </div>
      ` : ''}

      <div class="integration-card-footer">
        ${actionsHtml}
      </div>
    </article>
  `;
}
