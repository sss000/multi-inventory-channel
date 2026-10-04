import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { loadClientConfig, loadServerConfig } from "@platform/config";
import { 
  DEFAULT_FEATURE_FLAGS, 
  FeatureFlags, 
  renderUIState 
} from "@platform/ui";
import { renderAppShell } from "./shell.js";
import { 
  renderOverviewView, 
  renderInventoryView, 
  renderExceptionsView, 
  renderOrdersView, 
  renderIntegrationsView, 
  renderBillingView, 
  renderStatesDemoView,
  renderOnboardingView 
} from "./views.js";

export * from "./ssr-session.js";
export * from "./shell.js";
export * from "./views.js";

export interface WebServerOptions {
  portOverride?: number;
  featureFlags?: Partial<FeatureFlags>;
  userRole?: string;
  userEmail?: string;
}

export function startWebServer(options: WebServerOptions | number = {}) {
  const opts: WebServerOptions = typeof options === "number" ? { portOverride: options } : options;
  const serverConfig = loadServerConfig();
  const clientConfig = loadClientConfig();
  const port = opts.portOverride ?? serverConfig.WEB_PORT;
  const flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS, ...(opts.featureFlags || {}) };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url || "/";
    const parsedUrl = new URL(rawUrl, "http://localhost");
    const pathname = parsedUrl.pathname;

    // Health probes
    if (pathname === "/health" || pathname === "/ready" || pathname === "/live") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          service: "web",
          supabaseUrl: clientConfig.NEXT_PUBLIC_SUPABASE_URL,
          featureFlags: flags,
          timestamp: new Date().toISOString()
        })
      );
      return;
    }

    // Default redirect to /app/overview
    if (pathname === "/" || pathname === "/app") {
      res.writeHead(302, { Location: "/app/overview" });
      res.end();
      return;
    }

    // Feature Flagged Routes Check
    if (pathname === "/app/warehouses" && !flags.warehouses_v1) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderAppShell({
        title: "Feature Unavailable",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Warehouses", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderUIState({
          type: "permission_denied",
          title: "Feature Not Available",
          message: "Warehouses management is currently in private preview and not operationally available for this tenant.",
          code: "FEATURE_FLAG_DISABLED"
        })
      }));
      return;
    }

    if (pathname === "/app/purchasing" && !flags.purchasing_v1) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderAppShell({
        title: "Feature Unavailable",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Purchasing", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderUIState({
          type: "permission_denied",
          title: "Feature Not Available",
          message: "Purchasing workflows are currently feature-flagged and disabled in this environment.",
          code: "FEATURE_FLAG_DISABLED"
        })
      }));
      return;
    }

    if (pathname === "/app/reports" && !flags.reports_v1) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderAppShell({
        title: "Feature Unavailable",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Reports", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderUIState({
          type: "permission_denied",
          title: "Feature Not Available",
          message: "Reporting analytics are feature-flagged and disabled in this environment.",
          code: "FEATURE_FLAG_DISABLED"
        })
      }));
      return;
    }

    if (pathname === "/app/ai-assistant" && !flags.ai_assistant_v1) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderAppShell({
        title: "Feature Unavailable",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "AI Assistant", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderUIState({
          type: "permission_denied",
          title: "Feature Not Available",
          message: "AI Assistant is currently feature-flagged and disabled in this environment.",
          code: "FEATURE_FLAG_DISABLED"
        })
      }));
      return;
    }

    // Authenticated Application Routes
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });

    if (pathname === "/app/overview") {
      res.end(renderAppShell({
        title: "Overview",
        activeRoute: pathname,
        breadcrumbs: [{ label: "Overview", current: true }],
        featureFlags: flags,
        contentHtml: renderOverviewView()
      }));
      return;
    }

    if (pathname === "/app/inventory") {
      const activeFilters = {
        sku: parsedUrl.searchParams.get("sku") || undefined,
        product: parsedUrl.searchParams.get("product") || undefined,
        warehouse: parsedUrl.searchParams.get("warehouse") || undefined,
        channel: parsedUrl.searchParams.get("channel") || undefined,
        lowStock: (parsedUrl.searchParams.get("lowStock") as any) || undefined,
        mismatch: (parsedUrl.searchParams.get("mismatch") as any) || undefined,
        syncState: (parsedUrl.searchParams.get("syncState") as any) || undefined,
      };
      const isDrawerOpen = parsedUrl.searchParams.has("skuDetail") || parsedUrl.searchParams.has("drawer");
      res.end(renderAppShell({
        title: "Inventory Control",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Inventory", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderInventoryView({ activeFilters, isDrawerOpen })
      }));
      return;
    }

    if (pathname === "/app/exceptions") {
      res.end(renderAppShell({
        title: "Exception Inbox",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Exceptions", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderExceptionsView()
      }));
      return;
    }

    if (pathname === "/app/orders") {
      res.end(renderAppShell({
        title: "Orders",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Orders", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderOrdersView()
      }));
      return;
    }

    if (pathname === "/app/products") {
      res.end(renderAppShell({
        title: "Products",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Products", current: true }
        ],
        featureFlags: flags,
        contentHtml: `<div class="card p-6"><h2>Products Catalog</h2><p>Multi-channel product catalog and SKU variant mapping.</p></div>`
      }));
      return;
    }

    if (pathname === "/app/integrations") {
      res.end(renderAppShell({
        title: "Integrations",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Integrations", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderIntegrationsView()
      }));
      return;
    }

    if (pathname === "/app/billing") {
      res.end(renderAppShell({
        title: "Subscription & Billing",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Billing", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderBillingView()
      }));
      return;
    }

    if (pathname === "/app/settings") {
      res.end(renderAppShell({
        title: "Settings",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Settings", current: true }
        ],
        featureFlags: flags,
        contentHtml: `<div class="card p-6"><h2>Organization Settings</h2><p>Tenant configuration, team members, and role-based access control.</p></div>`
      }));
      return;
    }

    if (pathname === "/app/states-demo") {
      res.end(renderAppShell({
        title: "UI States Demo",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "States Demo", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderStatesDemoView()
      }));
      return;
    }

    if (pathname === "/app/onboarding") {
      const stepParam = parsedUrl.searchParams.get("step") || "VALIDATE_INVENTORY";
      const resolvedParam = parsedUrl.searchParams.get("resolved") === "true";
      res.end(renderAppShell({
        title: "Merchant Onboarding",
        activeRoute: pathname,
        breadcrumbs: [
          { label: "Overview", href: "/app/overview" },
          { label: "Onboarding Wizard", current: true }
        ],
        featureFlags: flags,
        contentHtml: renderOnboardingView({
          currentStepId: stepParam,
          discrepanciesResolved: resolvedParam,
        })
      }));
      return;
    }

    // 404 Not Found
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderAppShell({
      title: "Page Not Found",
      activeRoute: pathname,
      breadcrumbs: [
        { label: "Overview", href: "/app/overview" },
        { label: "404", current: true }
      ],
      featureFlags: flags,
      contentHtml: renderUIState({
        type: "error",
        title: "404 - Page Not Found",
        message: `The requested path '${pathname}' does not exist on this application server.`,
        code: "NOT_FOUND"
      })
    }));
  });

  server.listen(port, () => {
    console.log(`[Web] Merchant Web Portal running at http://localhost:${port}`);
  });

  return server;
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  startWebServer();
}
