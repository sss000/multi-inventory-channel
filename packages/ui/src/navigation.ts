import { DESIGN_TOKENS } from "./tokens.js";

export type FeatureFlagKey = 
  | "warehouses_v1"
  | "purchasing_v1"
  | "reports_v1"
  | "ai_assistant_v1"
  | "automations_v1"
  | "audit_export_v1";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  warehouses_v1: false,
  purchasing_v1: false,
  reports_v1: false,
  ai_assistant_v1: false,
  automations_v1: false,
  audit_export_v1: false
};

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  badge?: string;
  badgeVariant?: "default" | "success" | "warning" | "danger" | "info";
  group: "core" | "operations" | "platform" | "admin";
  featureFlag?: FeatureFlagKey;
  requiredPermission?: string;
  disabled?: boolean;
  preview?: boolean;
}

/**
 * MVP Production Navigation Items per Prompt 25:
 * Overview, Inventory, Orders, Products, Exceptions, Integrations, Settings, Billing
 */
export const MVP_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/app/overview",
    icon: "layout-dashboard",
    group: "core"
  },
  {
    id: "inventory",
    label: "Inventory",
    href: "/app/inventory",
    icon: "boxes",
    group: "operations",
    requiredPermission: "inventory:read"
  },
  {
    id: "orders",
    label: "Orders",
    href: "/app/orders",
    icon: "shopping-cart",
    group: "operations",
    requiredPermission: "orders:read"
  },
  {
    id: "products",
    label: "Products",
    href: "/app/products",
    icon: "tag",
    group: "operations",
    requiredPermission: "catalog:read"
  },
  {
    id: "exceptions",
    label: "Exceptions",
    href: "/app/exceptions",
    icon: "alert-triangle",
    badge: "0",
    badgeVariant: "danger",
    group: "operations",
    requiredPermission: "reconciliation:read"
  },
  {
    id: "integrations",
    label: "Integrations",
    href: "/app/integrations",
    icon: "plug-zap",
    group: "platform",
    requiredPermission: "channels:read"
  },
  {
    id: "settings",
    label: "Settings",
    href: "/app/settings",
    icon: "settings",
    group: "admin",
    requiredPermission: "organization:manage"
  },
  {
    id: "billing",
    label: "Billing",
    href: "/app/billing",
    icon: "credit-card",
    group: "admin",
    requiredPermission: "billing:read"
  }
];

/**
 * V1 / Future Surfaces that must remain feature-flagged per Prompt 25:
 * Warehouses, Purchasing, Reports, AI Assistant.
 * Must NOT appear as operationally available when disabled.
 */
export const FEATURE_FLAGGED_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: "warehouses",
    label: "Warehouses",
    href: "/app/warehouses",
    icon: "warehouse",
    group: "operations",
    featureFlag: "warehouses_v1",
    requiredPermission: "inventory:read",
    preview: true
  },
  {
    id: "purchasing",
    label: "Purchasing",
    href: "/app/purchasing",
    icon: "truck",
    group: "operations",
    featureFlag: "purchasing_v1",
    requiredPermission: "inventory:manage",
    preview: true
  },
  {
    id: "reports",
    label: "Reports",
    href: "/app/reports",
    icon: "bar-chart-2",
    group: "platform",
    featureFlag: "reports_v1",
    requiredPermission: "audit:read",
    preview: true
  },
  {
    id: "ai-assistant",
    label: "AI Assistant",
    href: "/app/ai-assistant",
    icon: "sparkles",
    group: "platform",
    featureFlag: "ai_assistant_v1",
    requiredPermission: "organization:manage",
    preview: true
  }
];

export const ALL_NAVIGATION_ITEMS: NavigationItem[] = [
  ...MVP_NAVIGATION_ITEMS,
  ...FEATURE_FLAGGED_NAVIGATION_ITEMS
];

export interface NavigationFilterOptions {
  flags?: Partial<FeatureFlags>;
  permissions?: string[];
  includeDisabledPreview?: boolean;
}

/**
 * Filters navigation items according to active feature flags and RBAC permissions.
 * Disabled feature-flagged items are excluded unless explicitly requested as preview/disabled.
 * When included as preview, they are explicitly marked disabled=true and cannot be operated.
 */
export function getVisibleNavigationItems(options: NavigationFilterOptions = {}): NavigationItem[] {
  const flags = { ...DEFAULT_FEATURE_FLAGS, ...(options.flags || {}) };
  const permissions = options.permissions ? new Set(options.permissions) : null;
  const includePreview = options.includeDisabledPreview ?? false;

  return ALL_NAVIGATION_ITEMS.filter((item) => {
    // 1. Feature Flag Check
    if (item.featureFlag) {
      const isFlagEnabled = Boolean(flags[item.featureFlag]);
      if (!isFlagEnabled && !includePreview) {
        return false;
      }
    }

    // 2. Permission Check
    if (permissions && item.requiredPermission) {
      if (!permissions.has(item.requiredPermission) && !permissions.has("admin:action") && !permissions.has("*")) {
        return false;
      }
    }

    return true;
  }).map((item) => {
    if (item.featureFlag && !flags[item.featureFlag]) {
      return {
        ...item,
        disabled: true,
        badge: "Preview",
        badgeVariant: "info"
      };
    }
    return item;
  });
}

/**
 * Navigation Icons SVG mapping for sharp, accessible rendering without heavy icon font dependencies.
 */
export const NAVIGATION_ICONS: Record<string, string> = {
  "layout-dashboard": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  "boxes": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l6.06 3.46a2 2 0 0 0 1.94 0l6.06-3.46a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L12 9.5z"/><path d="m7 16.5-4.74-2.85"/><path d="m17 16.5 4.74-2.85"/><path d="M12 21v-7.5"/><path d="M12 9.5 2.97 4.37A2 2 0 0 1 2 2.66V2a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v.66a2 2 0 0 1-.97 1.71L12 9.5z"/></svg>`,
  "shopping-cart": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
  "tag": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7" cy="7" r=".5" fill="currentColor"/></svg>`,
  "alert-triangle": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  "plug-zap": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13 2-2 2.5h3L11 9"/><path d="M10 14v-3"/><path d="M14 14v-3"/><path d="M11 19c-1.7 0-3-1.3-3-3v-2h8v2c0 1.7-1.3 3-3 3Z"/><path d="M12 22v-3"/></svg>`,
  "settings": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  "credit-card": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  "warehouse": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/></svg>`,
  "truck": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>`,
  "bar-chart-2": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  "sparkles": `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`
};

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface TopbarOptions {
  organizationName: string;
  organizationTier?: string;
  userEmail: string;
  userRole?: string;
  unreadNotificationsCount?: number;
  systemHealth?: "operational" | "degraded" | "outage";
  theme?: "dark" | "light";
}

/**
 * Renders the accessible Application Shell Topbar with org switcher, system status pulse,
 * search trigger, notifications counter, and user profile menu.
 */
export function renderTopbar(options: TopbarOptions): string {
  const healthColor = options.systemHealth === "degraded" 
    ? DESIGN_TOKENS.colors.status.stale 
    : options.systemHealth === "outage"
    ? DESIGN_TOKENS.colors.status.conflict
    : DESIGN_TOKENS.colors.status.verified;

  const healthLabel = options.systemHealth === "degraded"
    ? "Degraded"
    : options.systemHealth === "outage"
    ? "Outage"
    : "Systems Operational";

  const unreadCount = options.unreadNotificationsCount || 0;
  const unreadBadge = unreadCount > 0 
    ? `<span class="topbar-unread-badge" aria-label="${unreadCount} unread notifications">${unreadCount > 99 ? '99+' : unreadCount}</span>` 
    : "";

  return `
    <header class="app-topbar" role="banner">
      <div class="topbar-left">
        <button class="mobile-nav-toggle" aria-label="Toggle navigation menu" id="mobileNavToggle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div class="org-switcher" role="combobox" aria-label="Current Organization" tabindex="0">
          <span class="org-icon">🏢</span>
          <div class="org-info">
            <span class="org-name">${options.organizationName}</span>
            <span class="org-tier">${options.organizationTier || "Starter"}</span>
          </div>
          <svg class="org-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>

      <div class="topbar-center">
        <button class="global-search-trigger" id="cmdPaletteTrigger" aria-label="Open Command Palette (Ctrl+K)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span class="search-placeholder">Quick search SKUs, orders, channels...</span>
          <kbd class="cmd-shortcut">⌘K</kbd>
        </button>
      </div>

      <div class="topbar-right">
        <div class="system-status-indicator" title="System Status: ${healthLabel}">
          <span class="status-pulse" style="background-color: ${healthColor}; box-shadow: 0 0 8px ${healthColor}88;"></span>
          <span class="status-text">${healthLabel}</span>
        </div>

        <button class="theme-toggle-btn" id="themeToggleBtn" aria-label="Toggle Theme" title="Toggle Dark/Light Mode">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
        </button>

        <a href="/app/notifications" class="topbar-action-btn" aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          ${unreadBadge}
        </a>

        <div class="user-profile-menu" tabindex="0" role="button" aria-haspopup="true" aria-label="User account for ${options.userEmail}">
          <div class="user-avatar">${options.userEmail.charAt(0).toUpperCase()}</div>
          <div class="user-details">
            <span class="user-email">${options.userEmail}</span>
            <span class="user-role">${options.userRole || "Member"}</span>
          </div>
        </div>
      </div>
    </header>
  `;
}

/**
 * Renders the accessible Application Shell Sidebar with branded logo, grouped navigation,
 * active indicator, and feature-flagged badge treatment.
 */
export function renderSidebar(activeRoute: string, items: NavigationItem[]): string {
  const groups: Record<string, NavigationItem[]> = {
    core: [],
    operations: [],
    platform: [],
    admin: []
  };

  for (const item of items) {
    const targetGroup = groups[item.group];
    if (targetGroup) {
      targetGroup.push(item);
    }
  }

  const groupLabels: Record<string, string> = {
    core: "CORE",
    operations: "OPERATIONS",
    platform: "PLATFORM & CHANNELS",
    admin: "ORGANIZATION & BILLING"
  };

  let sidebarContentHtml = "";

  for (const [groupKey, groupItems] of Object.entries(groups)) {
    if (groupItems.length === 0) continue;

    sidebarContentHtml += `
      <div class="sidebar-group" role="group" aria-label="${groupLabels[groupKey]}">
        <span class="sidebar-group-header">${groupLabels[groupKey]}</span>
        <ul class="sidebar-nav-list" role="menu">
    `;

    for (const item of groupItems) {
      const isActive = activeRoute.startsWith(item.href);
      const iconSvg = NAVIGATION_ICONS[item.icon] || NAVIGATION_ICONS["boxes"];
      const activeClass = isActive ? "active" : "";
      const disabledClass = item.disabled ? "disabled" : "";
      const badgeHtml = item.badge 
        ? `<span class="nav-badge badge-${item.badgeVariant || 'default'}">${item.badge}</span>` 
        : "";

      sidebarContentHtml += `
        <li role="none">
          <a href="${item.disabled ? '#' : item.href}" 
             class="sidebar-nav-link ${activeClass} ${disabledClass}"
             role="menuitem"
             ${isActive ? 'aria-current="page"' : ''}
             ${item.disabled ? 'aria-disabled="true" tabindex="-1"' : ''}
             data-nav-id="${item.id}">
            <span class="nav-icon">${iconSvg}</span>
            <span class="nav-label">${item.label}</span>
            ${badgeHtml}
          </a>
        </li>
      `;
    }

    sidebarContentHtml += `
        </ul>
      </div>
    `;
  }

  return `
    <aside class="app-sidebar" id="appSidebar" role="navigation" aria-label="Main Navigation">
      <div class="sidebar-brand">
        <a href="/app/overview" class="brand-link" aria-label="Go to Overview">
          <span class="brand-logo-glow"></span>
          <svg class="brand-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
          <div class="brand-text-wrapper">
            <span class="brand-title">OmniChannel</span>
            <span class="brand-subtitle">INVENTORY CONTROL</span>
          </div>
        </a>
      </div>

      <nav class="sidebar-nav-container">
        ${sidebarContentHtml}
      </nav>

      <div class="sidebar-footer">
        <div class="trust-ledger-badge">
          <span class="ledger-indicator"></span>
          <span class="ledger-label">Immutable Ledger Active</span>
        </div>
      </div>
    </aside>
  `;
}

/**
 * Renders hierarchical, semantic Breadcrumb navigation.
 */
export function renderBreadcrumbs(items: BreadcrumbItem[]): string {
  if (!items || items.length === 0) return "";

  const itemsHtml = items.map((item, index) => {
    const isLast = index === items.length - 1 || Boolean(item.current);
    if (isLast) {
      return `
        <li class="breadcrumb-item current" aria-current="page">
          <span class="breadcrumb-text">${item.label}</span>
        </li>
      `;
    }

    return `
      <li class="breadcrumb-item">
        <a href="${item.href || '#'}" class="breadcrumb-link">${item.label}</a>
        <span class="breadcrumb-separator" aria-hidden="true">/</span>
      </li>
    `;
  }).join("");

  return `
    <nav class="breadcrumb-nav" aria-label="Breadcrumb">
      <ol class="breadcrumb-list">
        ${itemsHtml}
      </ol>
    </nav>
  `;
}
