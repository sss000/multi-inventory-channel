import { DESIGN_TOKENS } from "../tokens.js";

export type UIStateType = 
  | "loading"
  | "empty"
  | "success"
  | "error"
  | "partial_failure"
  | "permission_denied";

export interface UIStateAction {
  label: string;
  href?: string;
  onClick?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}

export interface UIStateConfig {
  type: UIStateType;
  title?: string;
  message?: string;
  code?: string;
  correlationId?: string;
  actions?: UIStateAction[];
  details?: string | Record<string, any>;
  iconSvg?: string;
}

/**
 * Universal 6-State UI Handling.
 * Prompt 25 explicitly mandates that every production page/component must support:
 * - loading
 * - empty
 * - success
 * - error
 * - partial failure
 * - permission denied
 */
export function renderUIState(config: UIStateConfig): string {
  switch (config.type) {
    case "loading":
      return renderLoadingState(config);
    case "empty":
      return renderEmptyState(config);
    case "success":
      return renderSuccessState(config);
    case "error":
      return renderErrorState(config);
    case "partial_failure":
      return renderPartialFailureState(config);
    case "permission_denied":
      return renderPermissionDeniedState(config);
    default:
      return renderEmptyState(config);
  }
}

/**
 * Loading State: Sleek animated pulse shimmer with accessible aria-busy and optional spinner.
 */
export function renderLoadingState(config: Partial<UIStateConfig> = {}): string {
  const title = config.title || "Loading inventory data...";
  const message = config.message || "Retrieving authoritative ledger records and channel states";

  return `
    <div class="state-container state-loading" role="status" aria-busy="true" aria-live="polite">
      <div class="loading-spinner-wrapper">
        <div class="loading-spinner"></div>
      </div>
      <h3 class="state-title">${title}</h3>
      <p class="state-message">${message}</p>
      <div class="loading-skeleton-group">
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-body"></div>
        <div class="skeleton-line skeleton-body short"></div>
      </div>
    </div>
  `;
}

/**
 * Empty State: Descriptive icon, clean title, helpful explanation, and clear CTA.
 */
export function renderEmptyState(config: Partial<UIStateConfig> = {}): string {
  const title = config.title || "No records found";
  const message = config.message || "There are no active records matching the current filters or query.";
  const icon = config.iconSvg || `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon-svg" aria-hidden="true">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.3 7 8.7 5 8.7-5"/>
      <path d="M12 22V12"/>
    </svg>
  `;

  const actionsHtml = (config.actions || []).map(action => `
    <a href="${action.href || '#'}" 
       class="btn btn-${action.variant || 'primary'}"
       ${action.onClick ? `onclick="${action.onClick}"` : ''}>
      ${action.label}
    </a>
  `).join("");

  return `
    <div class="state-container state-empty" role="region" aria-label="Empty State">
      <div class="state-icon-wrapper empty-illustration">
        ${icon}
      </div>
      <h3 class="state-title">${title}</h3>
      <p class="state-message">${message}</p>
      ${actionsHtml ? `<div class="state-actions">${actionsHtml}</div>` : ""}
    </div>
  `;
}

/**
 * Success State: Confirmed green status check, feedback message, and forward actions.
 */
export function renderSuccessState(config: Partial<UIStateConfig> = {}): string {
  const title = config.title || "Operation completed successfully";
  const message = config.message || "All records have been synchronized and verified against the immutable ledger.";

  const actionsHtml = (config.actions || []).map(action => `
    <a href="${action.href || '#'}" 
       class="btn btn-${action.variant || 'primary'}"
       ${action.onClick ? `onclick="${action.onClick}"` : ''}>
      ${action.label}
    </a>
  `).join("");

  return `
    <div class="state-container state-success" role="status" aria-live="polite">
      <div class="state-icon-wrapper success-check">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h3 class="state-title">${title}</h3>
      <p class="state-message">${message}</p>
      ${actionsHtml ? `<div class="state-actions">${actionsHtml}</div>` : ""}
    </div>
  `;
}

/**
 * Error State: Diagnostic card showing error code, correlation ID, and recovery action.
 */
export function renderErrorState(config: Partial<UIStateConfig> = {}): string {
  const title = config.title || "Failed to load data";
  const message = config.message || "An unexpected error occurred while communicating with the platform API.";
  const code = config.code ? `<span class="error-code-badge">Code: ${config.code}</span>` : "";
  const correlation = config.correlationId ? `<span class="correlation-tag">Correlation: <code>${config.correlationId}</code></span>` : "";

  const actionsHtml = (config.actions || [{ label: "Retry", variant: "primary", onClick: "window.location.reload()" }]).map(action => `
    <a href="${action.href || '#'}" 
       class="btn btn-${action.variant || 'primary'}"
       ${action.onClick ? `onclick="${action.onClick}"` : ''}>
      ${action.label}
    </a>
  `).join("");

  return `
    <div class="state-container state-error" role="alert" aria-live="assertive">
      <div class="state-icon-wrapper error-mark">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 class="state-title">${title}</h3>
      <p class="state-message">${message}</p>
      ${code || correlation ? `<div class="diagnostic-meta">${code} ${correlation}</div>` : ""}
      <div class="state-actions">${actionsHtml}</div>
    </div>
  `;
}

/**
 * Partial Failure State: Informs the user of partial completion and diagnostic details.
 */
export function renderPartialFailureState(config: Partial<UIStateConfig> = {}): string {
  const title = config.title || "Operation partially completed";
  const message = config.message || "Some channels or SKUs were synchronized, but errors occurred on external providers.";
  
  let detailsHtml = "";
  if (config.details) {
    const formattedDetails = typeof config.details === "string" 
      ? config.details 
      : JSON.stringify(config.details, null, 2);
    detailsHtml = `
      <details class="partial-failure-details">
        <summary>View Diagnostic Details</summary>
        <pre><code>${formattedDetails}</code></pre>
      </details>
    `;
  }

  const actionsHtml = (config.actions || [{ label: "Retry Failed", variant: "primary" }]).map(action => `
    <a href="${action.href || '#'}" 
       class="btn btn-${action.variant || 'primary'}"
       ${action.onClick ? `onclick="${action.onClick}"` : ''}>
      ${action.label}
    </a>
  `).join("");

  return `
    <div class="state-container state-partial-failure" role="alert">
      <div class="state-icon-wrapper warning-mark">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <h3 class="state-title">${title}</h3>
      <p class="state-message">${message}</p>
      ${detailsHtml}
      <div class="state-actions">${actionsHtml}</div>
    </div>
  `;
}

/**
 * Permission Denied State: Clear elevation explanation, admin contact CTA, and return link.
 */
export function renderPermissionDeniedState(config: Partial<UIStateConfig> = {}): string {
  const title = config.title || "Access Denied";
  const message = config.message || "You do not have permission to view or modify this resource. Please contact your organization administrator to request access.";

  const actionsHtml = (config.actions || [
    { label: "Return to Overview", href: "/app/overview", variant: "primary" }
  ]).map(action => `
    <a href="${action.href || '#'}" 
       class="btn btn-${action.variant || 'primary'}"
       ${action.onClick ? `onclick="${action.onClick}"` : ''}>
      ${action.label}
    </a>
  `).join("");

  return `
    <div class="state-container state-permission-denied" role="alert">
      <div class="state-icon-wrapper lock-mark">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h3 class="state-title">${title}</h3>
      <p class="state-message">${message}</p>
      ${config.code ? `<div class="diagnostic-meta"><span class="error-code-badge">${config.code}</span></div>` : ""}
      <div class="state-actions">${actionsHtml}</div>
    </div>
  `;
}
