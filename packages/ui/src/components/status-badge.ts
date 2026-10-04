import { TrustState } from "@platform/domain";

export type StatusCategory = "trust" | "sync" | "order" | "severity" | "operational";

export interface StatusBadgeProps {
  status: string;
  category?: StatusCategory;
  label?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  pulsing?: boolean;
  className?: string;
}

export interface StatusVisualDefinition {
  label: string;
  iconSvg: string;
  colorVar: string;
  bgVar: string;
  borderVar: string;
}

export const STATUS_DEFINITIONS: Record<string, StatusVisualDefinition> = {
  // Trust States
  LIVE: {
    label: "Live",
    colorVar: "var(--color-status-live, #06b6d4)",
    bgVar: "rgba(6, 182, 212, 0.12)",
    borderVar: "rgba(6, 182, 212, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>`
  },
  VERIFIED: {
    label: "Verified",
    colorVar: "var(--color-status-verified, #10b981)",
    bgVar: "rgba(16, 185, 129, 0.12)",
    borderVar: "rgba(16, 185, 129, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
  },
  STALE: {
    label: "Stale",
    colorVar: "var(--color-status-stale, #f59e0b)",
    bgVar: "rgba(245, 158, 11, 0.12)",
    borderVar: "rgba(245, 158, 11, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
  },
  CONFLICT: {
    label: "Conflict",
    colorVar: "var(--color-status-conflict, #ef4444)",
    bgVar: "rgba(239, 68, 68, 0.12)",
    borderVar: "rgba(239, 68, 68, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  },
  UNKNOWN: {
    label: "Unknown",
    colorVar: "var(--color-status-unknown, #64748b)",
    bgVar: "rgba(100, 116, 139, 0.12)",
    borderVar: "rgba(100, 116, 139, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  },

  // Sync States
  SYNCED: {
    label: "Synced",
    colorVar: "var(--color-status-verified, #10b981)",
    bgVar: "rgba(16, 185, 129, 0.12)",
    borderVar: "rgba(16, 185, 129, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
  },
  IN_PROGRESS: {
    label: "Syncing",
    colorVar: "var(--color-status-live, #06b6d4)",
    bgVar: "rgba(6, 182, 212, 0.12)",
    borderVar: "rgba(6, 182, 212, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
  },
  PENDING: {
    label: "Pending",
    colorVar: "var(--color-status-stale, #f59e0b)",
    bgVar: "rgba(245, 158, 11, 0.12)",
    borderVar: "rgba(245, 158, 11, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
  },
  FAILED: {
    label: "Failed",
    colorVar: "var(--color-status-conflict, #ef4444)",
    bgVar: "rgba(239, 68, 68, 0.12)",
    borderVar: "rgba(239, 68, 68, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  },

  // Order Lifecycle States
  DRAFT: {
    label: "Draft",
    colorVar: "#94a3b8",
    bgVar: "rgba(148, 163, 184, 0.12)",
    borderVar: "rgba(148, 163, 184, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
  },
  RESERVED: {
    label: "Reserved",
    colorVar: "#3b82f6",
    bgVar: "rgba(59, 130, 246, 0.12)",
    borderVar: "rgba(59, 130, 246, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`
  },
  ALLOCATED: {
    label: "Allocated",
    colorVar: "#8b5cf6",
    bgVar: "rgba(139, 92, 246, 0.12)",
    borderVar: "rgba(139, 92, 246, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1"/><path d="M18 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4"/></svg>`
  },
  FULFILLED: {
    label: "Fulfilled",
    colorVar: "var(--color-status-verified, #10b981)",
    bgVar: "rgba(16, 185, 129, 0.12)",
    borderVar: "rgba(16, 185, 129, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
  },
  CANCELLED: {
    label: "Cancelled",
    colorVar: "#64748b",
    bgVar: "rgba(100, 116, 139, 0.12)",
    borderVar: "rgba(100, 116, 139, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  },

  // Exception Severities
  LOW: {
    label: "Low",
    colorVar: "#3b82f6",
    bgVar: "rgba(59, 130, 246, 0.12)",
    borderVar: "rgba(59, 130, 246, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>`
  },
  MEDIUM: {
    label: "Medium",
    colorVar: "#f59e0b",
    bgVar: "rgba(245, 158, 11, 0.12)",
    borderVar: "rgba(245, 158, 11, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  },
  HIGH: {
    label: "High",
    colorVar: "#f97316",
    bgVar: "rgba(249, 115, 22, 0.12)",
    borderVar: "rgba(249, 115, 22, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  },
  CRITICAL: {
    label: "Critical",
    colorVar: "#ef4444",
    bgVar: "rgba(239, 68, 68, 0.15)",
    borderVar: "rgba(239, 68, 68, 0.4)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  }
};

/**
 * StatusBadge component: Maps domain status to semantic presentation.
 * Adheres to Section 5.3 of 03_FRONTEND_SPEC.md.
 */
export function renderStatusBadge(props: StatusBadgeProps): string {
  const normKey = props.status.toUpperCase();
  const def = STATUS_DEFINITIONS[normKey] || {
    label: props.label || props.status,
    colorVar: "#64748b",
    bgVar: "rgba(100, 116, 139, 0.12)",
    borderVar: "rgba(100, 116, 139, 0.3)",
    iconSvg: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>`
  };

  const label = props.label || def.label;
  const sizeClass = props.size ? `badge-${props.size}` : "badge-md";
  const showIcon = props.showIcon ?? true;
  const pulseClass = props.pulsing ? "badge-pulsing" : "";
  const customClass = props.className || "";

  const titleAttr = props.description ? `title="${props.description}"` : `title="${label}"`;
  const ariaLabel = props.description ? `aria-label="${label}: ${props.description}"` : `aria-label="${label}"`;

  return `
    <span class="status-badge ${sizeClass} ${pulseClass} ${customClass}"
          ${titleAttr}
          ${ariaLabel}
          style="--badge-color: ${def.colorVar}; --badge-bg: ${def.bgVar}; --badge-border: ${def.borderVar};">
      ${showIcon ? `<span class="badge-icon" aria-hidden="true">${def.iconSvg}</span>` : ""}
      <span class="badge-label">${label}</span>
    </span>
  `;
}
