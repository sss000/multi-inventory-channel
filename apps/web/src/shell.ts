import { 
  BASE_DESIGN_SYSTEM_CSS, 
  DESIGN_TOKENS, 
  renderTopbar, 
  renderSidebar, 
  renderBreadcrumbs, 
  BreadcrumbItem, 
  getVisibleNavigationItems, 
  FeatureFlags,
  DEFAULT_FEATURE_FLAGS
} from "@platform/ui";

export interface AppShellContext {
  title: string;
  activeRoute: string;
  breadcrumbs: BreadcrumbItem[];
  contentHtml: string;
  userEmail?: string;
  userRole?: string;
  organizationName?: string;
  organizationTier?: string;
  featureFlags?: Partial<FeatureFlags>;
  permissions?: string[];
  systemHealth?: "operational" | "degraded" | "outage";
  unreadNotificationsCount?: number;
}

/**
 * Client-side script injected into the Application Shell for:
 * - Dark / Light theme toggling with localStorage persistence
 * - Mobile sidebar collapse / expand
 * - Command palette trigger modal
 * - Accessible Modal and Drawer close actions
 */
export const APP_SHELL_INTERACTIVE_SCRIPT = `
  <script>
    (function() {
      // 1. Theme management
      const savedTheme = localStorage.getItem("omnichannel_theme") || "dark";
      document.documentElement.setAttribute("data-theme", savedTheme);

      const themeToggleBtn = document.getElementById("themeToggleBtn");
      if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", function() {
          const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
          const newTheme = currentTheme === "dark" ? "light" : "dark";
          document.documentElement.setAttribute("data-theme", newTheme);
          localStorage.setItem("omnichannel_theme", newTheme);
        });
      }

      // 2. Mobile Sidebar toggle
      const mobileNavToggle = document.getElementById("mobileNavToggle");
      const appSidebar = document.getElementById("appSidebar");
      if (mobileNavToggle && appSidebar) {
        mobileNavToggle.addEventListener("click", function() {
          appSidebar.classList.toggle("mobile-open");
        });
      }

      // 3. Modal / Drawer close handlers
      document.addEventListener("click", function(e) {
        const closeDrawerBtn = e.target.closest("[data-close-drawer]");
        if (closeDrawerBtn) {
          const drawerId = closeDrawerBtn.getAttribute("data-close-drawer");
          const overlay = document.getElementById("overlay-" + drawerId);
          if (overlay) {
            overlay.classList.remove("drawer-open");
            overlay.classList.add("drawer-closed");
            overlay.setAttribute("hidden", "true");
            overlay.setAttribute("aria-hidden", "true");
          }
        }

        const closeModalBtn = e.target.closest("[data-close-modal], [data-dismiss-dialog]");
        if (closeModalBtn) {
          const modalId = closeModalBtn.getAttribute("data-close-modal") || closeModalBtn.getAttribute("data-dismiss-dialog");
          const backdrop = document.getElementById("backdrop-" + modalId);
          if (backdrop) {
            backdrop.classList.remove("modal-open");
            backdrop.classList.add("modal-closed");
            backdrop.setAttribute("hidden", "true");
            backdrop.setAttribute("aria-hidden", "true");
          }
        }

        // Overlay backdrop click to close
        if (e.target.classList.contains("modal-backdrop")) {
          e.target.classList.remove("modal-open");
          e.target.classList.add("modal-closed");
          e.target.setAttribute("hidden", "true");
          e.target.setAttribute("aria-hidden", "true");
        }
        if (e.target.classList.contains("drawer-overlay")) {
          e.target.classList.remove("drawer-open");
          e.target.classList.add("drawer-closed");
          e.target.setAttribute("hidden", "true");
          e.target.setAttribute("aria-hidden", "true");
        }
      });

      // 4. Command Palette (Ctrl+K / Cmd+K)
      window.addEventListener("keydown", function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          const trigger = document.getElementById("cmdPaletteTrigger");
          if (trigger) trigger.click();
        }
        if (e.key === "Escape") {
          document.querySelectorAll(".modal-backdrop.modal-open, .drawer-overlay.drawer-open").forEach(function(el) {
            el.classList.remove("modal-open", "drawer-open");
            el.classList.add("modal-closed", "drawer-closed");
            el.setAttribute("hidden", "true");
            el.setAttribute("aria-hidden", "true");
          });
        }
      });
    })();
  </script>
`;

/**
 * Renders the full HTML document for the Authenticated Application Shell.
 * Incorporates:
 * - High-contrast typography & color tokens
 * - Global CSS with glassmorphic cards and dynamic micro-animations
 * - Topbar with Org Switcher, search, status, theme toggle, and notifications
 * - Sidebar with feature-flagged and RBAC-gated navigation
 * - Hierarchical Breadcrumbs
 * - Main content view
 */
export function renderAppShell(ctx: AppShellContext): string {
  const visibleNavItems = getVisibleNavigationItems({
    flags: ctx.featureFlags || DEFAULT_FEATURE_FLAGS,
    permissions: ctx.permissions
  });

  const sidebarHtml = renderSidebar(ctx.activeRoute, visibleNavItems);
  const topbarHtml = renderTopbar({
    organizationName: ctx.organizationName || "Acme Logistics Corp",
    organizationTier: ctx.organizationTier || "Growth Plan",
    userEmail: ctx.userEmail || "merchant@acme.example",
    userRole: ctx.userRole || "Administrator",
    unreadNotificationsCount: ctx.unreadNotificationsCount || 2,
    systemHealth: ctx.systemHealth || "operational"
  });
  const breadcrumbsHtml = renderBreadcrumbs(ctx.breadcrumbs);

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${ctx.title} | Multichannel Inventory Control Platform</title>
    <meta name="description" content="Authoritative multi-channel inventory synchronization and discrepancy reconciliation platform." />
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      ${BASE_DESIGN_SYSTEM_CSS}

      /* Shell layout styles */
      .app-layout-root {
        display: flex;
        min-height: 100vh;
        background-color: var(--color-surface-bg);
      }

      .app-main-viewport {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        margin-left: 260px;
        transition: margin-left 0.2s ease;
      }

      @media (max-width: 1024px) {
        .app-main-viewport {
          margin-left: 0;
        }
      }

      .app-page-container {
        flex: 1;
        padding: var(--space-8);
        max-width: 1600px;
        width: 100%;
        margin: 0 auto;
        animation: fadeIn 0.2s ease-out;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .page-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-6);
        gap: var(--space-4);
        flex-wrap: wrap;
      }

      .page-title-group h1 {
        margin: 0 0 var(--space-1) 0;
        font-size: var(--text-2xl);
        font-weight: 700;
        letter-spacing: -0.025em;
        color: var(--color-surface-text);
      }

      .page-title-group p {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--color-surface-muted);
      }

      .page-header-actions {
        display: flex;
        gap: var(--space-3);
        align-items: center;
      }
    </style>
  </head>
  <body>
    <div class="app-layout-root">
      ${sidebarHtml}
      <div class="app-main-viewport">
        ${topbarHtml}
        <main class="app-page-container" id="main-content" role="main">
          ${breadcrumbsHtml}
          ${ctx.contentHtml}
        </main>
      </div>
    </div>
    ${APP_SHELL_INTERACTIVE_SCRIPT}
  </body>
</html>`;
}
