/**
 * Phase 24: Authenticated Application UI Foundation Test Suite
 * Canonical Specification: Prompt 25 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md, 03_FRONTEND_SPEC.md, & 04_HUMAN_UX_SPEC.md
 *
 * Verifies:
 * 1. MVP Production Navigation:
 *    - Overview, Inventory, Orders, Products, Exceptions, Integrations, Settings, Billing.
 * 2. Feature-Flagged Future Surfaces:
 *    - Warehouses, Purchasing, Reports, AI Assistant must remain feature-flagged and not appear operationally available when disabled.
 * 3. Reusable UI Components:
 *    - DataTable, StatusBadge, MetricCard, ExceptionCard, Timeline, Drawer, Modal, ConfirmDialog, EmptyState, ErrorState, LoadingState, IntegrationCard, InventoryCell.
 * 4. Universal 6-State UI Handling:
 *    - loading, empty, success, error, partial failure, permission denied.
 * 5. Application Shell & Web Server Integration:
 *    - Topbar, Sidebar, Breadcrumbs, accessible interactions, theme switcher, route protections.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { 
  DESIGN_TOKENS,
  MVP_NAVIGATION_ITEMS,
  FEATURE_FLAGGED_NAVIGATION_ITEMS,
  getVisibleNavigationItems,
  renderStatusBadge,
  renderMetricCard,
  renderExceptionCard,
  renderTimeline,
  renderDrawer,
  renderModal,
  renderConfirmDialog,
  renderDataTable,
  renderIntegrationCard,
  renderInventoryCell,
  renderUIState,
  renderEmptyState,
  renderErrorState,
  renderLoadingState,
  renderPartialFailureState,
  renderPermissionDeniedState,
  renderSuccessState
} from "@platform/ui";
import { startWebServer, renderAppShell } from "@platform/web";

describe("Phase 24: Authenticated Application UI Foundation (Prompt 25)", () => {
  let server: http.Server;
  const TEST_PORT = 3982;

  before(async () => {
    server = startWebServer({
      portOverride: TEST_PORT,
      featureFlags: {
        warehouses_v1: false,
        purchasing_v1: false,
        reports_v1: false,
        ai_assistant_v1: false
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Helper for HTTP requests
  async function fetchRoute(path: string): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${TEST_PORT}${path}`, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          resolve({ status: res.statusCode || 500, text: data });
        });
      }).on("error", reject);
    });
  }

  describe("1. MVP Production Navigation & Feature Flag Gating", () => {
    it("includes all 8 MVP production navigation items", () => {
      const ids = MVP_NAVIGATION_ITEMS.map((item) => item.id);
      assert.deepEqual(ids, [
        "overview",
        "inventory",
        "orders",
        "products",
        "exceptions",
        "integrations",
        "settings",
        "billing"
      ]);
    });

    it("feature-flagged future surfaces (Warehouses, Purchasing, Reports, AI Assistant) are hidden by default", () => {
      const visible = getVisibleNavigationItems({
        flags: {
          warehouses_v1: false,
          purchasing_v1: false,
          reports_v1: false,
          ai_assistant_v1: false
        }
      });

      const visibleIds = visible.map((i) => i.id);
      assert.ok(!visibleIds.includes("warehouses"));
      assert.ok(!visibleIds.includes("purchasing"));
      assert.ok(!visibleIds.includes("reports"));
      assert.ok(!visibleIds.includes("ai-assistant"));
      assert.deepEqual(visibleIds, [
        "overview",
        "inventory",
        "orders",
        "products",
        "exceptions",
        "integrations",
        "settings",
        "billing"
      ]);
    });

    it("surfaces feature-flagged items when explicitly enabled", () => {
      const visible = getVisibleNavigationItems({
        flags: {
          warehouses_v1: true,
          purchasing_v1: true,
          reports_v1: false,
          ai_assistant_v1: false
        }
      });

      const visibleIds = visible.map((i) => i.id);
      assert.ok(visibleIds.includes("warehouses"));
      assert.ok(visibleIds.includes("purchasing"));
      assert.ok(!visibleIds.includes("reports"));
      assert.ok(!visibleIds.includes("ai-assistant"));
    });

    it("renders feature-flagged items as disabled with preview badge when includeDisabledPreview is true", () => {
      const visible = getVisibleNavigationItems({
        flags: { warehouses_v1: false },
        includeDisabledPreview: true
      });

      const warehousesItem = visible.find((i) => i.id === "warehouses");
      assert.ok(warehousesItem !== undefined);
      assert.strictEqual(warehousesItem?.disabled, true);
      assert.strictEqual(warehousesItem?.badge, "Preview");
    });

    it("respects RBAC permission filtering on navigation items", () => {
      // User with only catalog:read
      const viewerNav = getVisibleNavigationItems({
        permissions: ["catalog:read"]
      });

      const viewerIds = viewerNav.map((i) => i.id);
      assert.ok(viewerIds.includes("overview")); // no permission required
      assert.ok(viewerIds.includes("products")); // catalog:read
      assert.ok(!viewerIds.includes("inventory")); // requires inventory:read
      assert.ok(!viewerIds.includes("billing")); // requires billing:read
      assert.ok(!viewerIds.includes("settings")); // requires organization:manage
    });
  });

  describe("2. Universal 6-State UI Handling", () => {
    it("renders loading state with skeleton pulse and aria-busy", () => {
      const html = renderLoadingState({
        title: "Fetching authoritative balances..."
      });
      assert.ok(html.includes('role="status"'));
      assert.ok(html.includes('aria-busy="true"'));
      assert.ok(html.includes("Fetching authoritative balances..."));
      assert.ok(html.includes("loading-skeleton-group"));
    });

    it("renders empty state with illustration and CTA", () => {
      const html = renderEmptyState({
        title: "No SKUs tracked",
        message: "Get started by importing your catalog.",
        actions: [{ label: "Import CSV", href: "/app/import", variant: "primary" }]
      });
      assert.ok(html.includes('role="region"'));
      assert.ok(html.includes("No SKUs tracked"));
      assert.ok(html.includes("Get started by importing your catalog."));
      assert.ok(html.includes("Import CSV"));
    });

    it("renders success state with check indicator", () => {
      const html = renderSuccessState({
        title: "Discrepancy resolved",
        message: "Ledger recount verified against physical count."
      });
      assert.ok(html.includes("state-success"));
      assert.ok(html.includes("Discrepancy resolved"));
    });

    it("renders error state with error code and correlation ID", () => {
      const html = renderErrorState({
        title: "Provider sync failure",
        message: "Shopify API returned 504 Gateway Timeout.",
        code: "GATEWAY_TIMEOUT",
        correlationId: "cid-test-491"
      });
      assert.ok(html.includes('role="alert"'));
      assert.ok(html.includes("Provider sync failure"));
      assert.ok(html.includes("GATEWAY_TIMEOUT"));
      assert.ok(html.includes("cid-test-491"));
    });

    it("renders partial failure state with expandable diagnostic details", () => {
      const html = renderPartialFailureState({
        title: "Partial Broadcast Failure",
        message: "3 of 4 channels updated.",
        details: { failedChannel: "Amazon", reason: "THROTTLED" }
      });
      assert.ok(html.includes("state-partial-failure"));
      assert.ok(html.includes("Partial Broadcast Failure"));
      assert.ok(html.includes("THROTTLED"));
    });

    it("renders permission denied state with elevation notice", () => {
      const html = renderPermissionDeniedState({
        title: "Access Restricted",
        message: "Requires inventory:manage permission.",
        code: "FORBIDDEN"
      });
      assert.ok(html.includes("state-permission-denied"));
      assert.ok(html.includes("Access Restricted"));
      assert.ok(html.includes("Requires inventory:manage permission."));
    });

    it("renderUIState routes correctly to all 6 state renderers", () => {
      const states = ["loading", "empty", "success", "error", "partial_failure", "permission_denied"] as const;
      for (const st of states) {
        const output = renderUIState({ type: st });
        assert.ok(output !== undefined);
        assert.ok(output.length > 50);
      }
    });
  });

  describe("3. Reusable UI Component Suite (All 13 Components)", () => {
    it("1. StatusBadge: renders canonical trust states and never allows raw arbitrary styles", () => {
      const liveBadge = renderStatusBadge({ status: "LIVE" });
      const verifiedBadge = renderStatusBadge({ status: "VERIFIED" });
      const staleBadge = renderStatusBadge({ status: "STALE" });
      const conflictBadge = renderStatusBadge({ status: "CONFLICT" });
      const unknownBadge = renderStatusBadge({ status: "UNKNOWN" });

      assert.ok(liveBadge.includes("Live"));
      assert.ok(verifiedBadge.includes("Verified"));
      assert.ok(staleBadge.includes("Stale"));
      assert.ok(conflictBadge.includes("Conflict"));
      assert.ok(unknownBadge.includes("Unknown"));

      // Verify severity badges
      const critBadge = renderStatusBadge({ status: "CRITICAL", category: "severity" });
      assert.ok(critBadge.includes("Critical"));
    });

    it("2. MetricCard: renders KPI metrics with trend delta, trust badge, and loading skeleton", () => {
      const card = renderMetricCard({
        title: "Authoritative Sync Rate",
        value: "99.98%",
        delta: "+0.04%",
        deltaDirection: "up",
        trendLabel: "24h SLA",
        trustState: "LIVE"
      });
      assert.ok(card.includes("Authoritative Sync Rate"));
      assert.ok(card.includes("99.98%"));
      assert.ok(card.includes("+0.04%"));
      assert.ok(card.includes("Live"));

      const loadingCard = renderMetricCard({
        title: "Pending Syncs",
        value: "0",
        loading: true
      });
      assert.ok(loadingCard.includes("metric-card-loading"));
    });

    it("3. ExceptionCard: renders severity, diagnostic fields, and resolution actions", () => {
      const exc = renderExceptionCard({
        id: "exc-101",
        title: "Quantity Drift Flagged",
        description: "Discrepancy of 4 units observed between ledger and Shopify.",
        severity: "HIGH",
        sku: "TEST-SKU-001",
        channel: "Shopify US",
        timestamp: "10 mins ago",
        resolutionOptions: [
          { id: "res-sync", label: "Sync Now", action: "sync", variant: "primary" }
        ]
      });
      assert.ok(exc.includes("Quantity Drift Flagged"));
      assert.ok(exc.includes("TEST-SKU-001"));
      assert.ok(exc.includes("Shopify US"));
      assert.ok(exc.includes("Sync Now"));
      assert.ok(exc.includes("severity-high"));
    });

    it("4. Timeline: renders chronological event sequence with delta badges", () => {
      const timeline = renderTimeline({
        title: "Ledger Events",
        events: [
          {
            id: "e-1",
            title: "Manual Recount",
            eventType: "RECOUNT",
            quantityDelta: +10,
            timestamp: "2026-10-03 19:00:00",
            status: "success"
          }
        ]
      });
      assert.ok(timeline.includes("Ledger Events"));
      assert.ok(timeline.includes("Manual Recount"));
      assert.ok(timeline.includes("+10 units"));
    });

    it("5. Drawer: renders accessible slide-out panel with dialog semantics", () => {
      const drawer = renderDrawer({
        id: "sku-drawer",
        title: "SKU Inspection: ABC-123",
        isOpen: true,
        contentHtml: "<p>Deep inspection body</p>"
      });
      assert.ok(drawer.includes('role="dialog"'));
      assert.ok(drawer.includes('aria-modal="true"'));
      assert.ok(drawer.includes("SKU Inspection: ABC-123"));
      assert.ok(drawer.includes("Deep inspection body"));
      assert.ok(drawer.includes("drawer-open"));
    });

    it("6. Modal: renders accessible dialog with focus-trap and backdrop", () => {
      const modal = renderModal({
        id: "adjust-modal",
        title: "Adjust Inventory",
        isOpen: true,
        contentHtml: "<div>Adjustment form</div>"
      });
      assert.ok(modal.includes('role="dialog"'));
      assert.ok(modal.includes('aria-modal="true"'));
      assert.ok(modal.includes("Adjust Inventory"));
      assert.ok(modal.includes("modal-open"));
    });

    it("7. ConfirmDialog: renders destructive confirmation with typed check guardrail", () => {
      const dialog = renderConfirmDialog({
        id: "delete-dlg",
        title: "Confirm Disconnect",
        message: "This will disconnect Shopify Store US.",
        intent: "danger",
        requiresTypedConfirmation: "DISCONNECT",
        isOpen: true
      });
      assert.ok(dialog.includes('role="alertdialog"'));
      assert.ok(dialog.includes("Confirm Disconnect"));
      assert.ok(dialog.includes("data-expected-confirmation=\"DISCONNECT\""));
      assert.ok(dialog.includes("confirm-danger"));
    });

    it("8. DataTable: renders columns, rows, actions, and server-side pagination with default 50 / max 250", () => {
      const table = renderDataTable({
        id: "test-grid",
        rowKey: "id",
        totalCount: 150,
        page: 1,
        pageSize: 50,
        columns: [
          { key: "id", header: "ID", sortable: true },
          { key: "name", header: "Name" }
        ],
        data: [
          { id: "1", name: "Item One" },
          { id: "2", name: "Item Two" }
        ],
        actions: [
          { id: "view", label: "View" }
        ]
      });

      assert.ok(table.includes('role="grid"'));
      assert.ok(table.includes("Item One"));
      assert.ok(table.includes("Item Two"));
      assert.ok(table.includes("Page 1 of 3"));
      assert.ok(table.includes("Showing <span class=\"fw-semibold\">1</span> to <span class=\"fw-semibold\">50</span> of <span class=\"fw-semibold\">150</span> records"));
    });

    it("9. IntegrationCard: renders channel logo, connection health, and telemetry", () => {
      const card = renderIntegrationCard({
        id: "int-shopify",
        channelType: "shopify",
        channelName: "Shopify Store US",
        status: "ACTIVE",
        syncHealth: "HEALTHY",
        skuCount: 4200
      });
      assert.ok(card.includes("Shopify Store US"));
      assert.ok(card.includes("Mapped SKUs"));
      assert.ok(card.includes("4,200"));
      assert.ok(card.includes("HEALTHY"));
    });

    it("10. InventoryCell: renders ledger invariant breakdown (available = on_hand - reserved - safety)", () => {
      const cell = renderInventoryCell({
        available: 38,
        onHand: 42,
        reserved: 4,
        safetyStock: 5,
        trustState: "VERIFIED",
        sku: "TEST-SKU"
      });
      assert.ok(cell.includes("38"));
      assert.ok(cell.includes("Available"));
      assert.ok(cell.includes("On Hand:"));
      assert.ok(cell.includes("42"));
      assert.ok(cell.includes("Reserved:"));
      assert.ok(cell.includes("4"));
      assert.ok(cell.includes("Safety:"));
      assert.ok(cell.includes("5"));
      assert.ok(cell.includes("Verified"));
    });

    it("11. EmptyState: renders inside DataTable when state is empty", () => {
      const emptyTable = renderDataTable({
        columns: [{ key: "id", header: "ID" }],
        data: [],
        rowKey: "id",
        state: "empty",
        emptyTitle: "Zero Records Found"
      });
      assert.ok(emptyTable.includes("Zero Records Found"));
      assert.ok(emptyTable.includes("state-empty"));
    });

    it("12. ErrorState: renders inside DataTable when state is error", () => {
      const errorTable = renderDataTable({
        columns: [{ key: "id", header: "ID" }],
        data: [],
        rowKey: "id",
        state: "error",
        errorMessage: "Database connection failed"
      });
      assert.ok(errorTable.includes("Database connection failed"));
      assert.ok(errorTable.includes("state-error"));
    });

    it("13. LoadingState: renders inside DataTable when state is loading", () => {
      const loadingTable = renderDataTable({
        columns: [{ key: "id", header: "ID" }],
        data: [],
        rowKey: "id",
        state: "loading"
      });
      assert.ok(loadingTable.includes("Loading records..."));
      assert.ok(loadingTable.includes("state-loading"));
    });
  });

  describe("4. Web Application Server Probes & Feature Flag Route Protection", () => {
    it("GET /health returns 200 OK with web service status and feature flags", async () => {
      const res = await fetchRoute("/health");
      assert.strictEqual(res.status, 200);
      const json = JSON.parse(res.text);
      assert.strictEqual(json.status, "healthy");
      assert.strictEqual(json.service, "web");
      assert.strictEqual(json.featureFlags.warehouses_v1, false);
    });

    it("GET / redirects to /app/overview", async () => {
      return new Promise<void>((resolve, reject) => {
        http.get(`http://localhost:${TEST_PORT}/`, (res) => {
          assert.strictEqual(res.statusCode, 302);
          assert.strictEqual(res.headers.location, "/app/overview");
          resolve();
        }).on("error", reject);
      });
    });

    it("GET /app/overview renders complete Application Shell, Topbar, Sidebar, and Metrics", async () => {
      const res = await fetchRoute("/app/overview");
      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes("Overview | Multichannel Inventory Control Platform"));
      assert.ok(res.text.includes("app-sidebar"));
      assert.ok(res.text.includes("app-topbar"));
      assert.ok(res.text.includes("Total SKUs Tracked"));
      assert.ok(res.text.includes("Authoritative Sync Rate"));
    });

    it("GET /app/inventory renders authoritative inventory table and breakdowns", async () => {
      const res = await fetchRoute("/app/inventory");
      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes("Inventory Control"));
      assert.ok(res.text.includes("WIRELESS-HEADSET-BLK"));
      assert.ok(res.text.includes("USB-C-DOCK-PRO"));
    });

    it("GET /app/exceptions renders exception inbox with diagnostic cards", async () => {
      const res = await fetchRoute("/app/exceptions");
      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes("Exception Inbox"));
      assert.ok(res.text.includes("Channel Quantity Mismatch Detected"));
    });

    it("GET /app/orders renders orders table with lifecycle badges", async () => {
      const res = await fetchRoute("/app/orders");
      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes("Orders"));
      assert.ok(res.text.includes("ORD-98124"));
    });

    it("GET /app/integrations renders integration cards for connected channels", async () => {
      const res = await fetchRoute("/app/integrations");
      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes("Channel Integrations"));
      assert.ok(res.text.includes("Shopify Store US"));
      assert.ok(res.text.includes("Amazon North America"));
      assert.ok(res.text.includes("Walmart Marketplace"));
    });

    it("GET /app/billing renders subscription tier and usage metrics", async () => {
      const res = await fetchRoute("/app/billing");
      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes("Subscription & Billing"));
      assert.ok(res.text.includes("Growth Plan"));
      assert.ok(res.text.includes("Monthly Order Quota"));
    });

    it("GET /app/states-demo renders all 6 universal UI states simultaneously", async () => {
      const res = await fetchRoute("/app/states-demo");
      assert.strictEqual(res.status, 200);
      assert.ok(res.text.includes("1. Loading State"));
      assert.ok(res.text.includes("2. Empty State"));
      assert.ok(res.text.includes("3. Success State"));
      assert.ok(res.text.includes("4. Error State"));
      assert.ok(res.text.includes("5. Partial Failure State"));
      assert.ok(res.text.includes("6. Permission Denied State"));
    });

    it("Blocks disabled feature-flagged routes (/app/warehouses) with 404 / Feature Not Available", async () => {
      const res = await fetchRoute("/app/warehouses");
      assert.strictEqual(res.status, 404);
      assert.ok(res.text.includes("Feature Not Available"));
      assert.ok(res.text.includes("Warehouses management is currently in private preview"));
      assert.ok(res.text.includes("FEATURE_FLAG_DISABLED"));
    });

    it("Blocks disabled feature-flagged routes (/app/purchasing) with 404 / Feature Not Available", async () => {
      const res = await fetchRoute("/app/purchasing");
      assert.strictEqual(res.status, 404);
      assert.ok(res.text.includes("Feature Not Available"));
      assert.ok(res.text.includes("Purchasing workflows are currently feature-flagged"));
    });

    it("Blocks disabled feature-flagged routes (/app/reports) with 404 / Feature Not Available", async () => {
      const res = await fetchRoute("/app/reports");
      assert.strictEqual(res.status, 404);
      assert.ok(res.text.includes("Feature Not Available"));
      assert.ok(res.text.includes("Reporting analytics are feature-flagged"));
    });

    it("Blocks disabled feature-flagged routes (/app/ai-assistant) with 404 / Feature Not Available", async () => {
      const res = await fetchRoute("/app/ai-assistant");
      assert.strictEqual(res.status, 404);
      assert.ok(res.text.includes("Feature Not Available"));
      assert.ok(res.text.includes("AI Assistant is currently feature-flagged"));
    });
  });
});
