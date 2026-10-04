/**
 * Comprehensive Design Tokens & Base CSS System
 * Canonical Specifications:
 * - 02_PRODUCT_DESIGN_SPEC.md
 * - 03_FRONTEND_SPEC.md (Sections 4 & 5)
 * - 04_HUMAN_UX_SPEC.md
 */

export const DESIGN_TOKENS = {
  colors: {
    brand: {
      primary: "#0F172A",      // Deep slate/navy
      primaryHover: "#1E293B",
      accent: "#3B82F6",       // Vibrant blue accent
      accentHover: "#2563EB",
      accentMuted: "rgba(59, 130, 246, 0.12)",
    },
    status: {
      live: "#10B981",         // Emerald - Realtime live connection
      liveBg: "rgba(16, 185, 129, 0.12)",
      verified: "#059669",     // Deep green - Read-back verified
      verifiedBg: "rgba(5, 150, 105, 0.12)",
      stale: "#F59E0B",        // Amber - Awaiting sync / delayed
      staleBg: "rgba(245, 158, 11, 0.12)",
      conflict: "#EF4444",     // Red - Discrepancy detected
      conflictBg: "rgba(239, 68, 68, 0.12)",
      unknown: "#64748B",       // Neutral slate - Not yet observed
      unknownBg: "rgba(100, 116, 139, 0.12)",
      info: "#38BDF8",         // Sky blue
      infoBg: "rgba(56, 189, 248, 0.12)",
    },
    surface: {
      background: "#090D16",   // Sleek dark baseline background
      backgroundLight: "#F8FAFC",
      panel: "#131B2E",        // Card & table background
      panelLight: "#FFFFFF",
      panelHover: "#1E293B",
      panelHoverLight: "#F1F5F9",
      header: "#0B1120",
      headerLight: "#FFFFFF",
      sidebar: "#0D1527",
      sidebarLight: "#FFFFFF",
      border: "rgba(255, 255, 255, 0.08)",
      borderLight: "#E2E8F0",
      borderStrong: "rgba(255, 255, 255, 0.16)",
      borderStrongLight: "#CBD5E1",
      glass: "rgba(19, 27, 46, 0.75)",
      glassLight: "rgba(255, 255, 255, 0.85)",
    },
    text: {
      primary: "#F8FAFC",
      primaryLight: "#0F172A",
      secondary: "#94A3B8",
      secondaryLight: "#475569",
      muted: "#64748B",
      mutedLight: "#94A3B8",
      inverse: "#0F172A",
      inverseLight: "#F8FAFC",
    },
    severity: {
      critical: "#DC2626",
      criticalBg: "rgba(220, 38, 38, 0.15)",
      high: "#EA580C",
      highBg: "rgba(234, 88, 12, 0.15)",
      medium: "#D97706",
      mediumBg: "rgba(217, 119, 6, 0.15)",
      low: "#2563EB",
      lowBg: "rgba(37, 99, 235, 0.15)",
    },
  },
  typography: {
    fontSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontMono: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    sizes: {
      xs: "0.75rem",     // 12px
      sm: "0.875rem",    // 14px
      base: "1rem",      // 16px
      lg: "1.125rem",    // 18px
      xl: "1.25rem",     // 20px
      "2xl": "1.5rem",   // 24px
      "3xl": "1.875rem", // 30px
    },
    weights: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
  },
  spacing: {
    xs: "0.25rem",   // 4px
    sm: "0.5rem",    // 8px
    md: "1rem",      // 16px
    lg: "1.5rem",    // 24px
    xl: "2rem",      // 32px
    "2xl": "3rem",   // 48px
  },
  borderRadius: {
    xs: "0.25rem",   // 4px
    sm: "0.375rem",  // 6px
    md: "0.5rem",    // 8px
    lg: "0.75rem",   // 12px
    xl: "1rem",      // 16px
    full: "9999px",
  },
  shadows: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.25)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)",
    glowAccent: "0 0 20px rgba(59, 130, 246, 0.35)",
    glowConflict: "0 0 20px rgba(239, 68, 68, 0.35)",
    glowVerified: "0 0 20px rgba(16, 185, 129, 0.35)",
  },
  transitions: {
    fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
    normal: "250ms cubic-bezier(0.4, 0, 0.2, 1)",
    smooth: "350ms cubic-bezier(0.16, 1, 0.3, 1)",
  },
  zIndex: {
    header: 40,
    sidebar: 30,
    drawer: 50,
    modal: 60,
    toast: 70,
    tooltip: 80,
  },
} as const;

/**
 * Global CSS variable definitions for light and dark modes with glassmorphic aesthetics.
 */
export const BASE_DESIGN_SYSTEM_CSS = `
:root {
  --font-sans: ${DESIGN_TOKENS.typography.fontSans};
  --font-mono: ${DESIGN_TOKENS.typography.fontMono};

  /* Default Dark Mode Theme */
  --bg-app: ${DESIGN_TOKENS.colors.surface.background};
  --bg-panel: ${DESIGN_TOKENS.colors.surface.panel};
  --bg-panel-hover: ${DESIGN_TOKENS.colors.surface.panelHover};
  --bg-header: ${DESIGN_TOKENS.colors.surface.header};
  --bg-sidebar: ${DESIGN_TOKENS.colors.surface.sidebar};
  --border-subtle: ${DESIGN_TOKENS.colors.surface.border};
  --border-strong: ${DESIGN_TOKENS.colors.surface.borderStrong};
  --bg-glass: ${DESIGN_TOKENS.colors.surface.glass};

  --text-primary: ${DESIGN_TOKENS.colors.text.primary};
  --text-secondary: ${DESIGN_TOKENS.colors.text.secondary};
  --text-muted: ${DESIGN_TOKENS.colors.text.muted};

  --accent: ${DESIGN_TOKENS.colors.brand.accent};
  --accent-hover: ${DESIGN_TOKENS.colors.brand.accentHover};
  --accent-muted: ${DESIGN_TOKENS.colors.brand.accentMuted};

  --status-live: ${DESIGN_TOKENS.colors.status.live};
  --status-live-bg: ${DESIGN_TOKENS.colors.status.liveBg};
  --status-verified: ${DESIGN_TOKENS.colors.status.verified};
  --status-verified-bg: ${DESIGN_TOKENS.colors.status.verifiedBg};
  --status-stale: ${DESIGN_TOKENS.colors.status.stale};
  --status-stale-bg: ${DESIGN_TOKENS.colors.status.staleBg};
  --status-conflict: ${DESIGN_TOKENS.colors.status.conflict};
  --status-conflict-bg: ${DESIGN_TOKENS.colors.status.conflictBg};
  --status-unknown: ${DESIGN_TOKENS.colors.status.unknown};
  --status-unknown-bg: ${DESIGN_TOKENS.colors.status.unknownBg};

  --radius-sm: ${DESIGN_TOKENS.borderRadius.sm};
  --radius-md: ${DESIGN_TOKENS.borderRadius.md};
  --radius-lg: ${DESIGN_TOKENS.borderRadius.lg};
  --radius-full: ${DESIGN_TOKENS.borderRadius.full};

  --shadow-sm: ${DESIGN_TOKENS.shadows.sm};
  --shadow-md: ${DESIGN_TOKENS.shadows.md};
  --shadow-lg: ${DESIGN_TOKENS.shadows.lg};
  --transition-normal: ${DESIGN_TOKENS.transitions.normal};
}

[data-theme="light"] {
  --bg-app: ${DESIGN_TOKENS.colors.surface.backgroundLight};
  --bg-panel: ${DESIGN_TOKENS.colors.surface.panelLight};
  --bg-panel-hover: ${DESIGN_TOKENS.colors.surface.panelHoverLight};
  --bg-header: ${DESIGN_TOKENS.colors.surface.headerLight};
  --bg-sidebar: ${DESIGN_TOKENS.colors.surface.sidebarLight};
  --border-subtle: ${DESIGN_TOKENS.colors.surface.borderLight};
  --border-strong: ${DESIGN_TOKENS.colors.surface.borderStrongLight};
  --bg-glass: ${DESIGN_TOKENS.colors.surface.glassLight};

  --text-primary: ${DESIGN_TOKENS.colors.text.primaryLight};
  --text-secondary: ${DESIGN_TOKENS.colors.text.secondaryLight};
  --text-muted: ${DESIGN_TOKENS.colors.text.mutedLight};
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-sans);
  background-color: var(--bg-app);
  color: var(--text-primary);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Glassmorphism utility */
.glass-panel {
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
}

/* Focus outline accessibility */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Smooth micro-animations */
button, a, input, select, .interactive-card {
  transition: all var(--transition-normal);
}

/* =========================================================
   INVENTORY TABLE & SKU DETAIL DRAWER STYLES (Phase 26)
   ========================================================= */

.inventory-table-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
  width: 100%;
}

.inventory-filter-bar {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg, 12px);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.filter-inputs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.filter-input, .filter-select {
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm, 6px);
  color: var(--text-primary);
  font-size: 13px;
  padding: 8px 12px;
  outline: none;
  font-family: inherit;
}

.filter-input:focus, .filter-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-muted);
}

.filter-toggles-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
}

.filter-chips-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-full, 9999px);
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-app);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
}

.filter-chip:hover {
  background: var(--bg-panel-hover);
  color: var(--text-primary);
}

.filter-chip.active {
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  border-color: var(--accent);
}

.filter-actions-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-scroll-wrapper {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg, 12px);
  overflow-x: auto;
  box-shadow: var(--shadow-sm);
}

.inventory-data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.inventory-data-table thead th {
  background: var(--bg-header);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.inventory-data-table tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: middle;
}

.inventory-data-table tbody tr:hover {
  background: var(--bg-panel-hover);
}

.inventory-data-table tbody tr:last-child td {
  border-bottom: none;
}

.sku-inspect-link {
  background: none;
  border: none;
  color: var(--accent);
  padding: 0;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.sku-inspect-link:hover {
  color: var(--accent-hover);
}

.product-title-text {
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 240px;
}

.warehouse-pill {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(100, 116, 139, 0.12);
  color: var(--text-secondary);
  border: 1px solid rgba(100, 116, 139, 0.25);
  white-space: nowrap;
}

.available-cell-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.available-number {
  font-size: 14px;
  font-weight: 700;
}

.stock-pill {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.stock-normal {
  color: #10b981;
}

.stock-pill.stock-normal {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.stock-low {
  color: #f59e0b;
}

.stock-pill.stock-low {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.25);
}

.stock-out {
  color: #ef4444;
}

.stock-pill.stock-out {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.text-reserved {
  color: #f59e0b;
  font-weight: 600;
}

.inventory-pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md, 8px);
  font-size: 13px;
  color: var(--text-secondary);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* SKU Detail Drawer */
.sku-drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  justify-content: flex-end;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.sku-drawer-overlay.drawer-open {
  opacity: 1;
  pointer-events: auto;
}

.sku-drawer-panel {
  width: 720px;
  max-width: 92vw;
  height: 100%;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  transform: translateX(100%);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.sku-drawer-overlay.drawer-open .sku-drawer-panel {
  transform: translateX(0);
}

.sku-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-header);
}

.drawer-header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drawer-eyebrow {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.drawer-sku-title code {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.sku-drawer-nav {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-app);
  padding: 0 16px;
}

.drawer-nav-item {
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}

.drawer-nav-item:hover {
  color: var(--text-primary);
}

.drawer-nav-item.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.sku-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.sku-section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.inventory-equation-box {
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md, 8px);
  padding: 14px 18px;
  margin-top: 14px;
  margin-bottom: 16px;
}

.equation-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.equation-formula {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  font-family: var(--font-mono);
}

.eq-avail {
  color: #10b981;
}

.sku-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
}

.metric-card-sm {
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md, 8px);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-card-sm.available-card {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.05);
}

.metric-k {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
}

.metric-v-lg {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.metric-sub {
  font-size: 10px;
  color: var(--text-muted);
}

.detail-sub-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: var(--bg-app);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
}

.detail-sub-table th {
  background: var(--bg-panel-hover);
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  border-bottom: 1px solid var(--border-subtle);
}

.detail-sub-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.detail-sub-table .total-row td {
  background: var(--bg-panel-hover);
  border-top: 1px solid var(--border-subtle);
  font-weight: 600;
}

/* Explainable Timeline */
.explainable-timeline-spine {
  list-style: none;
  padding: 0;
  margin: 0;
  position: relative;
}

.explainable-timeline-spine::before {
  content: "";
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 11px;
  width: 2px;
  background: var(--border-subtle);
}

.explainable-timeline-node {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  position: relative;
}

.tl-node-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-panel);
  border: 2px solid var(--accent);
  z-index: 1;
  flex-shrink: 0;
}

.tl-node-body {
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md, 8px);
  padding: 12px 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tl-node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tl-timestamp {
  font-size: 11px;
  color: var(--text-muted);
}

.tl-title {
  font-size: 13px;
  color: var(--text-primary);
}

.tl-delta-chip {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
}

.delta-pos {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.delta-neg {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.delta-neutral {
  background: rgba(100, 116, 139, 0.15);
  color: #64748b;
}

.tl-channel-badge {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--bg-panel-hover);
  border-radius: 4px;
  color: var(--text-secondary);
}

.tl-actor {
  font-size: 11px;
  color: var(--text-muted);
}

.tl-transition-row {
  font-size: 12px;
  color: var(--text-secondary);
}

.tl-reason-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.tl-causal-evidence {
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-subtle);
  padding-top: 6px;
  margin-top: 4px;
}

.causal-chain-trail {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.chain-step {
  padding: 1px 6px;
  background: rgba(59, 130, 246, 0.12);
  color: var(--accent);
  border-radius: 4px;
  font-weight: 500;
}

.chain-sep {
  color: var(--text-muted);
}

.drawer-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-close-btn:hover {
  background: var(--bg-panel-hover);
  color: var(--text-primary);
}
`;
