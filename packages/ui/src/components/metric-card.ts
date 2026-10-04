import { TrustState } from "@platform/domain";
import { renderStatusBadge } from "./status-badge.js";

export interface MetricCardProps {
  id?: string;
  title: string;
  value: string | number;
  delta?: string | number;
  deltaDirection?: "up" | "down" | "neutral";
  trendLabel?: string;
  iconSvg?: string;
  trustState?: TrustState;
  footnote?: string;
  href?: string;
  loading?: boolean;
}

/**
 * MetricCard: Executive KPI metric presentation with trend indicators, trust badge,
 * and sparkline or visual accents.
 */
export function renderMetricCard(props: MetricCardProps): string {
  if (props.loading) {
    return `
      <div class="metric-card metric-card-loading" role="region" aria-label="Loading metric">
        <div class="metric-card-header">
          <div class="skeleton-line skeleton-title short"></div>
          <div class="skeleton-line" style="width: 20px; height: 20px; border-radius: 50%;"></div>
        </div>
        <div class="skeleton-line" style="width: 60%; height: 32px; margin: 12px 0;"></div>
        <div class="skeleton-line skeleton-body short"></div>
      </div>
    `;
  }

  const deltaDirection = props.deltaDirection || "neutral";
  let deltaHtml = "";

  if (props.delta !== undefined) {
    const isUp = deltaDirection === "up";
    const isDown = deltaDirection === "down";
    const deltaClass = isUp ? "delta-up" : isDown ? "delta-down" : "delta-neutral";
    const arrowSvg = isUp 
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`
      : isDown
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`
      : "";

    deltaHtml = `
      <div class="metric-delta ${deltaClass}" aria-label="Change: ${props.delta} ${props.trendLabel || ''}">
        ${arrowSvg}
        <span class="delta-value">${props.delta}</span>
        ${props.trendLabel ? `<span class="trend-label">${props.trendLabel}</span>` : ""}
      </div>
    `;
  }

  const trustBadgeHtml = props.trustState 
    ? renderStatusBadge({ status: props.trustState, size: "sm" }) 
    : "";

  const iconHtml = props.iconSvg 
    ? `<div class="metric-icon-box" aria-hidden="true">${props.iconSvg}</div>` 
    : "";

  const footnoteHtml = props.footnote 
    ? `<div class="metric-footnote">${props.footnote}</div>` 
    : "";

  const content = `
    <div class="metric-card-top">
      <div class="metric-card-title-group">
        <span class="metric-title">${props.title}</span>
        ${trustBadgeHtml}
      </div>
      ${iconHtml}
    </div>
    <div class="metric-card-middle">
      <div class="metric-value">${props.value}</div>
    </div>
    <div class="metric-card-bottom">
      ${deltaHtml}
      ${footnoteHtml}
    </div>
  `;

  if (props.href) {
    return `
      <a href="${props.href}" class="metric-card metric-card-interactive" id="${props.id || ''}" role="article">
        ${content}
      </a>
    `;
  }

  return `
    <div class="metric-card" id="${props.id || ''}" role="region" aria-label="${props.title}">
      ${content}
    </div>
  `;
}
