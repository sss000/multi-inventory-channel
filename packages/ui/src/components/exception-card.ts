import { renderStatusBadge } from "./status-badge.js";

export interface ExceptionResolutionOption {
  id: string;
  label: string;
  action: string;
  variant?: "primary" | "secondary" | "danger";
}

export interface ExceptionCardProps {
  id: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  channel?: string;
  sku?: string;
  timestamp: string;
  suggestedAction?: string;
  correlationId?: string;
  resolutionOptions?: ExceptionResolutionOption[];
  onInvestigateHref?: string;
}

/**
 * ExceptionCard: Visual card highlighting critical inventory discrepancies,
 * provider sync errors, and drift incidents with diagnostic details and quick actions.
 */
export function renderExceptionCard(props: ExceptionCardProps): string {
  const severityBadge = renderStatusBadge({
    status: props.severity,
    category: "severity",
    size: "sm"
  });

  const actionsHtml = (props.resolutionOptions || []).map(opt => `
    <button class="btn btn-${opt.variant || 'secondary'} btn-sm exception-action-btn"
            data-action="${opt.action}"
            data-exception-id="${props.id}"
            data-resolution-id="${opt.id}">
      ${opt.label}
    </button>
  `).join("");

  const investigateLink = props.onInvestigateHref ? `
    <a href="${props.onInvestigateHref}" class="btn btn-ghost btn-sm">
      Investigate Discrepancy →
    </a>
  ` : "";

  return `
    <article class="exception-card severity-${props.severity.toLowerCase()}" 
             id="exception-${props.id}"
             role="article" 
             aria-labelledby="exc-title-${props.id}">
      <div class="exception-card-header">
        <div class="exception-title-group">
          ${severityBadge}
          <h4 class="exception-title" id="exc-title-${props.id}">${props.title}</h4>
        </div>
        <time class="exception-timestamp" datetime="${props.timestamp}">${props.timestamp}</time>
      </div>

      <div class="exception-card-body">
        <p class="exception-description">${props.description}</p>
        
        <div class="exception-meta-grid">
          ${props.sku ? `<div class="meta-item"><span class="meta-key">SKU:</span> <code class="meta-val">${props.sku}</code></div>` : ""}
          ${props.channel ? `<div class="meta-item"><span class="meta-key">Channel:</span> <span class="meta-val">${props.channel}</span></div>` : ""}
          ${props.correlationId ? `<div class="meta-item"><span class="meta-key">Correlation:</span> <code class="meta-val">${props.correlationId}</code></div>` : ""}
        </div>

        ${props.suggestedAction ? `
          <div class="exception-suggestion">
            <span class="suggestion-icon">💡</span>
            <div class="suggestion-text">
              <strong>Recommended Action:</strong> ${props.suggestedAction}
            </div>
          </div>
        ` : ""}
      </div>

      <div class="exception-card-footer">
        <div class="resolution-actions">
          ${actionsHtml}
        </div>
        ${investigateLink}
      </div>
    </article>
  `;
}
