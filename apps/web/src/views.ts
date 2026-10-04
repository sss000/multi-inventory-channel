import { 
  renderMetricCard, 
  renderExceptionCard, 
  renderTimeline, 
  renderDataTable, 
  renderIntegrationCard, 
  renderInventoryCell, 
  renderStatusBadge, 
  renderUIState, 
  renderDrawer, 
  renderModal, 
  renderConfirmDialog,
  renderOnboardingStepper,
  renderDiscrepancyTable,
  renderSyncConfirmationCard,
  renderInventoryTable,
  renderSkuDetailDrawer,
  CANONICAL_ONBOARDING_STEPS,
  StepInfo
} from "@platform/ui";
import type {
  InventoryTableResponseDto,
  InventoryTableQuery,
  SkuDetailDto,
  ConnectedChannelColumnDto,
  InventoryTableRowDto,
} from "@platform/contracts";

/**
 * Overview View: Executive operational summary with KPI MetricCards,
 * critical Exception alerts, and recent immutable ledger timeline.
 */
export function renderOverviewView(): string {
  const metricCardsHtml = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-8);">
      ${renderMetricCard({
        title: "Total SKUs Tracked",
        value: "4,829",
        delta: "+12.4%",
        deltaDirection: "up",
        trendLabel: "vs last month",
        trustState: "VERIFIED",
        footnote: "Across 4 active distribution centers"
      })}
      ${renderMetricCard({
        title: "Authoritative Sync Rate",
        value: "99.98%",
        delta: "+0.04%",
        deltaDirection: "up",
        trendLabel: "24h SLA",
        trustState: "LIVE",
        footnote: "Average sync latency: 412ms"
      })}
      ${renderMetricCard({
        title: "Unresolved Drift & Exceptions",
        value: "2",
        delta: "-4",
        deltaDirection: "down",
        trendLabel: "resolved today",
        trustState: "CONFLICT",
        footnote: "Requires manual recount or sync correction"
      })}
      ${renderMetricCard({
        title: "Active Channel Accounts",
        value: "3",
        delta: "All Connected",
        deltaDirection: "neutral",
        trustState: "VERIFIED",
        footnote: "Shopify US, Amazon NA, Walmart"
      })}
    </div>
  `;

  const exceptionsHtml = `
    <div style="margin-bottom: var(--space-8);">
      <div class="page-header-row" style="margin-bottom: var(--space-4);">
        <h3 style="font-size: var(--text-lg); margin: 0; font-weight: 600;">Active Drift & Discrepancy Alerts</h3>
        <a href="/app/exceptions" class="btn btn-secondary btn-sm">View All Exceptions →</a>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--space-4);">
        ${renderExceptionCard({
          id: "exc-8921",
          title: "Channel Quantity Mismatch Detected",
          description: "Shopify reports 42 units for SKU 'WIRELESS-HEADSET-BLK', but authoritative ledger asserts 38 available (4 reserved for Order #1042).",
          severity: "HIGH",
          sku: "WIRELESS-HEADSET-BLK",
          channel: "Shopify Store US",
          timestamp: "5 minutes ago",
          suggestedAction: "Push authoritative balance (38) to Shopify to prevent overselling.",
          resolutionOptions: [
            { id: "push-auth", label: "Push Ledger Balance", action: "sync_authoritative", variant: "primary" },
            { id: "recount", label: "Request Recount", action: "request_recount", variant: "secondary" }
          ],
          onInvestigateHref: "/app/exceptions?id=exc-8921"
        })}
        ${renderExceptionCard({
          id: "exc-8922",
          title: "Amazon SP-API Feed Verification Timeout",
          description: "Read-back verification for feed #98231 exceeded 300s window. External inventory acknowledged but not yet verified.",
          severity: "MEDIUM",
          sku: "USB-C-DOCK-PRO",
          channel: "Amazon NA",
          timestamp: "22 minutes ago",
          suggestedAction: "Re-poll feed processing status or dispatch background sync.",
          resolutionOptions: [
            { id: "repoll", label: "Check Status Now", action: "repoll_feed", variant: "secondary" }
          ],
          onInvestigateHref: "/app/exceptions?id=exc-8922"
        })}
      </div>
    </div>
  `;

  const timelineHtml = `
    <div style="margin-bottom: var(--space-8);">
      ${renderTimeline({
        title: "Recent Immutable Ledger Mutations",
        events: [
          {
            id: "evt-01",
            title: "Order Reservation Captured",
            eventType: "ORDER_RESERVED",
            actor: "OrderSyncEngine",
            timestamp: "2026-10-03 19:15:02",
            quantityDelta: -2,
            status: "success",
            description: "Reserved 2 units of SKU 'ERGONOMIC-CHAIR-GRY' for Order #98124."
          },
          {
            id: "evt-02",
            title: "Manual Inventory Recount Completed",
            eventType: "RECOUNT_CORRECTION",
            actor: "operator@acme.example",
            timestamp: "2026-10-03 18:40:11",
            quantityDelta: +5,
            status: "info",
            description: "Physical count adjusted in Main Warehouse bin A-12."
          },
          {
            id: "evt-03",
            title: "Reconciliation Discrepancy Flagged",
            eventType: "DRIFT_DETECTED",
            actor: "ReconciliationEngine",
            timestamp: "2026-10-03 17:30:00",
            status: "warning",
            description: "Variance of -4 units observed on Shopify US."
          }
        ]
      })}
    </div>
  `;

  return `
    <div class="page-header-row">
      <div class="page-title-group">
        <h1>Overview</h1>
        <p>Real-time authoritative inventory positions, channel sync health, and drift resolution.</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-secondary btn-sm" onclick="window.location.reload()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Refresh Feed
        </button>
        <a href="/app/inventory" class="btn btn-primary btn-sm">Manage Inventory</a>
      </div>
    </div>
    ${metricCardsHtml}
    ${exceptionsHtml}
    ${timelineHtml}
  `;
}

export interface InventoryViewProps {
  tableData?: InventoryTableResponseDto;
  activeFilters?: Partial<InventoryTableQuery>;
  selectedSkuDetail?: SkuDetailDto | null;
  isDrawerOpen?: boolean;
}

/**
 * Inventory View (Phase 26: Prompt 27)
 * Shows comprehensive multichannel inventory control table with:
 * - Columns: SKU, Product, Warehouse, On Hand, Reserved, Available, Connected Channel Quantities, Status
 * - Dynamic connected channel columns (does NOT show eBay or Walmart when disabled)
 * - Server-side / stateful filtering & pagination
 * - Slide-out SKU detail drawer with all 8 canonical sections
 */
export function renderInventoryView(props: InventoryViewProps = {}): string {
  // Default Canonical Connected Channels: Shopify and Amazon are ACTIVE; eBay and Walmart are NOT enabled.
  const defaultConnectedChannels: ConnectedChannelColumnDto[] = [
    {
      id: "shopify-1",
      provider: "SHOPIFY",
      displayName: "Shopify US",
      status: "ACTIVE",
      isEnabled: true,
    },
    {
      id: "amazon-1",
      provider: "AMAZON",
      displayName: "Amazon NA",
      status: "ACTIVE",
      isEnabled: true,
    },
  ];

  const defaultWarehouses = [
    { id: "wh-1", name: "Main Fulfillment Center" },
    { id: "wh-2", name: "West Coast Hub" },
  ];

  // Canonical Seed Inventory Items covering all semantic trust states
  const defaultItems: InventoryTableRowDto[] = [
    {
      sku: "WIRELESS-HEADSET-BLK",
      productId: "prod-1",
      productTitle: "Pro Noise-Cancelling Wireless Headphones (Black)",
      warehouseId: "wh-1",
      warehouseName: "Main Fulfillment Center",
      onHand: 42,
      reserved: 4,
      allocated: 0,
      safetyStock: 5,
      damaged: 0,
      quarantined: 0,
      available: 33, // 42 - 4 - 5
      status: "CONFLICT",
      channelQuantities: {
        "shopify-1": {
          channelAccountId: "shopify-1",
          provider: "SHOPIFY",
          channelDisplayName: "Shopify US",
          externalQuantity: 33,
          internalQuantity: 33,
          difference: 0,
          syncState: "VERIFIED",
          lastVerifiedAt: "2 mins ago",
          isOperational: true,
        },
        "amazon-1": {
          channelAccountId: "amazon-1",
          provider: "AMAZON",
          channelDisplayName: "Amazon NA",
          externalQuantity: 35,
          internalQuantity: 33,
          difference: 2,
          syncState: "CONFLICT",
          lastVerifiedAt: "5 mins ago",
          isOperational: true,
        },
      },
      lastVerifiedAt: "2 mins ago",
      hasMismatch: true,
      isLowStock: false,
    },
    {
      sku: "USB-C-DOCK-PRO",
      productId: "prod-2",
      productTitle: "12-in-1 Triple Display Thunderbolt Dock",
      warehouseId: "wh-1",
      warehouseName: "Main Fulfillment Center",
      onHand: 130,
      reserved: 6,
      allocated: 0,
      safetyStock: 10,
      damaged: 0,
      quarantined: 0,
      available: 114, // 130 - 6 - 10
      status: "VERIFIED",
      channelQuantities: {
        "shopify-1": {
          channelAccountId: "shopify-1",
          provider: "SHOPIFY",
          channelDisplayName: "Shopify US",
          externalQuantity: 114,
          internalQuantity: 114,
          difference: 0,
          syncState: "VERIFIED",
          lastVerifiedAt: "12 mins ago",
          isOperational: true,
        },
        "amazon-1": {
          channelAccountId: "amazon-1",
          provider: "AMAZON",
          channelDisplayName: "Amazon NA",
          externalQuantity: 114,
          internalQuantity: 114,
          difference: 0,
          syncState: "VERIFIED",
          lastVerifiedAt: "12 mins ago",
          isOperational: true,
        },
      },
      lastVerifiedAt: "12 mins ago",
      hasMismatch: false,
      isLowStock: false,
    },
    {
      sku: "ERGONOMIC-CHAIR-GRY",
      productId: "prod-3",
      productTitle: "High-Back Mesh Executive Ergonomic Chair",
      warehouseId: "wh-2",
      warehouseName: "West Coast Hub",
      onHand: 10,
      reserved: 3,
      allocated: 0,
      safetyStock: 2,
      damaged: 0,
      quarantined: 0,
      available: 5, // 10 - 3 - 2
      status: "LIVE",
      channelQuantities: {
        "shopify-1": {
          channelAccountId: "shopify-1",
          provider: "SHOPIFY",
          channelDisplayName: "Shopify US",
          externalQuantity: 5,
          internalQuantity: 5,
          difference: 0,
          syncState: "LIVE",
          lastVerifiedAt: "Just now",
          isOperational: true,
        },
        "amazon-1": {
          channelAccountId: "amazon-1",
          provider: "AMAZON",
          channelDisplayName: "Amazon NA",
          externalQuantity: 5,
          internalQuantity: 5,
          difference: 0,
          syncState: "LIVE",
          lastVerifiedAt: "Just now",
          isOperational: true,
        },
      },
      lastVerifiedAt: "Just now",
      hasMismatch: false,
      isLowStock: true,
    },
    {
      sku: "MECHANICAL-KB-RGB",
      productId: "prod-4",
      productTitle: "Low-Profile Hot-Swappable Mechanical Keyboard",
      warehouseId: "wh-1",
      warehouseName: "Main Fulfillment Center",
      onHand: 2,
      reserved: 2,
      allocated: 0,
      safetyStock: 0,
      damaged: 0,
      quarantined: 0,
      available: 0, // 2 - 2 - 0
      status: "STALE",
      channelQuantities: {
        "shopify-1": {
          channelAccountId: "shopify-1",
          provider: "SHOPIFY",
          channelDisplayName: "Shopify US",
          externalQuantity: 0,
          internalQuantity: 0,
          difference: 0,
          syncState: "STALE",
          lastVerifiedAt: "1 hour ago",
          isOperational: true,
        },
        "amazon-1": {
          channelAccountId: "amazon-1",
          provider: "AMAZON",
          channelDisplayName: "Amazon NA",
          externalQuantity: 0,
          internalQuantity: 0,
          difference: 0,
          syncState: "STALE",
          lastVerifiedAt: "1 hour ago",
          isOperational: true,
        },
      },
      lastVerifiedAt: "1 hour ago",
      hasMismatch: false,
      isLowStock: true,
    },
    {
      sku: "ULTRAWIDE-MONITOR-34",
      productId: "prod-5",
      productTitle: "34-inch Curved UltraWide IPS Gaming Monitor",
      warehouseId: "wh-2",
      warehouseName: "West Coast Hub",
      onHand: 20,
      reserved: 5,
      allocated: 0,
      safetyStock: 5,
      damaged: 0,
      quarantined: 0,
      available: 10, // 20 - 5 - 5
      status: "UNKNOWN",
      channelQuantities: {
        "shopify-1": {
          channelAccountId: "shopify-1",
          provider: "SHOPIFY",
          channelDisplayName: "Shopify US",
          externalQuantity: 10,
          internalQuantity: 10,
          difference: 0,
          syncState: "UNKNOWN",
          lastVerifiedAt: null,
          isOperational: true,
        },
        "amazon-1": {
          channelAccountId: "amazon-1",
          provider: "AMAZON",
          channelDisplayName: "Amazon NA",
          externalQuantity: 10,
          internalQuantity: 10,
          difference: 0,
          syncState: "UNKNOWN",
          lastVerifiedAt: null,
          isOperational: true,
        },
      },
      lastVerifiedAt: null,
      hasMismatch: false,
      isLowStock: true,
    },
  ];

  // Active filters handling
  const activeFilters = props.activeFilters || {};
  let items = props.tableData ? props.tableData.items : defaultItems;
  const connectedChannels = props.tableData ? props.tableData.connectedChannels : defaultConnectedChannels;
  const warehouses = props.tableData ? props.tableData.warehouses : defaultWarehouses;

  // Apply filters if default dataset
  if (!props.tableData) {
    if (activeFilters.sku) {
      const q = activeFilters.sku.toLowerCase();
      items = items.filter((i) => i.sku.toLowerCase().includes(q));
    }
    if (activeFilters.product) {
      const q = activeFilters.product.toLowerCase();
      items = items.filter((i) => i.productTitle.toLowerCase().includes(q));
    }
    if (activeFilters.warehouse && activeFilters.warehouse !== "all" && activeFilters.warehouse !== "") {
      items = items.filter((i) => i.warehouseId === activeFilters.warehouse || i.warehouseName.toLowerCase().includes(activeFilters.warehouse!.toLowerCase()));
    }
    if (activeFilters.channel && activeFilters.channel !== "all" && activeFilters.channel !== "") {
      items = items.filter((i) => Boolean(i.channelQuantities[activeFilters.channel!]));
    }
    if (activeFilters.lowStock === "true") {
      items = items.filter((i) => i.isLowStock);
    }
    if (activeFilters.mismatch === "true") {
      items = items.filter((i) => i.hasMismatch);
    }
    if (activeFilters.syncState && activeFilters.syncState !== "all") {
      items = items.filter((i) => i.status === activeFilters.syncState);
    }
  }

  const pagination = props.tableData ? props.tableData.pagination : {
    page: 1,
    limit: 50,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / 50)),
    hasNext: false,
    hasPrev: false,
  };

  // Render Table
  const tableHtml = renderInventoryTable({
    items,
    connectedChannels,
    warehouses,
    activeFilters,
    pagination,
    ariaLabel: "Authoritative Multi-Channel Inventory Positions",
  });

  // Default Canonical SKU Detail (8 Sections) for WIRELESS-HEADSET-BLK
  const defaultSkuDetail: SkuDetailDto = {
    summary: {
      sku: "WIRELESS-HEADSET-BLK",
      productId: "prod-1",
      productTitle: "Pro Noise-Cancelling Wireless Headphones (Black)",
      brand: "AcousticPro",
      category: "Audio / Electronics",
      barcode: "BAR-08492048201",
      status: "ACTIVE",
      trustState: "CONFLICT",
      totalOnHand: 42,
      totalReserved: 4,
      totalAllocated: 0,
      totalSafetyStock: 5,
      totalDamaged: 0,
      totalQuarantined: 0,
      totalAvailable: 33,
      sellableFormulaEquation: "33 = 42 (On Hand) - 4 (Reserved) - 5 (Safety Stock) - 0 (Allocated)",
    },
    inventoryByWarehouse: [
      {
        warehouseId: "wh-1",
        warehouseName: "Main Fulfillment Center",
        locationCode: "LOC-WH1-A4",
        onHand: 42,
        reserved: 4,
        allocated: 0,
        available: 33,
        safetyStock: 5,
        updatedAt: "5 mins ago",
      },
    ],
    inventoryByChannel: [
      {
        channelAccountId: "shopify-1",
        provider: "SHOPIFY",
        channelDisplayName: "Shopify US",
        currentQuantity: 33,
        internalQuantity: 33,
        difference: 0,
        syncState: "VERIFIED",
        lastVerifiedAt: "2 mins ago",
        isOperational: true,
      },
      {
        channelAccountId: "amazon-1",
        provider: "AMAZON",
        channelDisplayName: "Amazon NA",
        currentQuantity: 35,
        internalQuantity: 33,
        difference: 2,
        syncState: "CONFLICT",
        lastVerifiedAt: "5 mins ago",
        isOperational: true,
      },
    ],
    synchronization: [
      {
        jobId: "sync-8921-shopify",
        channel: "shopify-1",
        provider: "SHOPIFY",
        direction: "OUTBOUND",
        operation: "UPDATE_INVENTORY",
        status: "VERIFIED",
        quantitySent: 33,
        verifiedQuantity: 33,
        latencyMs: 142,
        timestamp: "2 mins ago",
      },
      {
        jobId: "sync-8920-amazon",
        channel: "amazon-1",
        provider: "AMAZON",
        direction: "OUTBOUND",
        operation: "UPDATE_INVENTORY",
        status: "SENT", // Not green VERIFIED! Demonstrates: "Do not use a green success state for data that has merely been submitted"
        quantitySent: 33,
        verifiedQuantity: undefined,
        latencyMs: 215,
        timestamp: "5 mins ago",
      },
    ],
    exceptions: [
      {
        id: "exc-8921",
        severity: "HIGH",
        type: "INVENTORY_MISMATCH",
        title: "Amazon reported 35 units, authoritative ledger expects 33 (difference: +2 units)",
        difference: 2,
        channel: "amazon-1",
        status: "OPEN",
        suggestedAction: "Reconcile Amazon quantity by pushing authoritative available balance (33) to prevent overselling.",
        createdAt: "5 mins ago",
      },
    ],
    timeline: [
      {
        id: "evt-001",
        timestamp: "11:42:16",
        title: "Channel Discrepancy Flagged",
        eventType: "RECONCILIATION_AUDIT",
        quantityDelta: 0,
        beforeOnHand: 42,
        afterOnHand: 42,
        beforeAvailable: 33,
        afterAvailable: 33,
        channelOrWarehouse: "Amazon NA",
        actor: "ReconciliationEngine",
        actorType: "SYSTEM",
        reason: "Marketplace feed reported external stock 35, difference: +2",
        correlationId: "corr-8921-diff",
        causalChain: ["Quantity Audit", "Feed Read-Back", "Discrepancy Detected", "Exception Created"],
      },
      {
        id: "evt-002",
        timestamp: "11:41:20",
        title: "Order Inventory Reserved",
        eventType: "ORDER_RESERVATION",
        quantityDelta: -4,
        beforeOnHand: 42,
        afterOnHand: 42,
        beforeAvailable: 37,
        afterAvailable: 33,
        channelOrWarehouse: "Main Fulfillment Center",
        actor: "Alice Smith (Customer)",
        actorType: "CHANNEL",
        reason: "Order #ORD-1042 placed on Shopify",
        correlationId: "corr-1042-ord",
        causalChain: ["Order #ORD-1042", "Reservation #res-1042", "Ledger Balance Updated", "Sync Triggered"],
      },
      {
        id: "evt-003",
        timestamp: "09:15:00",
        title: "Purchase Receipt Inbounded",
        eventType: "PURCHASE_RECEIPT",
        quantityDelta: +42,
        beforeOnHand: 0,
        afterOnHand: 42,
        beforeAvailable: 0,
        afterAvailable: 37,
        channelOrWarehouse: "Main Fulfillment Center",
        actor: "Warehouse Manager",
        actorType: "USER",
        reason: "Inbound PO #PO-991 received and inspected",
        correlationId: "corr-po-991",
        causalChain: ["Inbound PO-991", "Warehouse Scan", "Physical On Hand Inbounded"],
      },
    ],
    orders: [
      {
        orderId: "ord-1042",
        orderNumber: "ORD-1042",
        channel: "Shopify US",
        customer: "Alice Smith <alice@example.com>",
        status: "RESERVED",
        quantityReserved: 4,
        reservedAt: "11:41:20",
      },
    ],
    audit: [
      {
        id: "aud-001",
        timestamp: "11:42:16",
        actor: "System",
        action: "EXCEPTION_CREATED",
        entityType: "SKU",
        entityId: "WIRELESS-HEADSET-BLK",
        reason: "Discrepancy detected on Amazon",
        correlationId: "corr-8921-diff",
      },
      {
        id: "aud-002",
        timestamp: "11:41:20",
        actor: "ShopifyWebhook",
        action: "RESERVATION_CREATED",
        entityType: "SKU",
        entityId: "WIRELESS-HEADSET-BLK",
        reason: "Order #ORD-1042 reserved 4 units",
        correlationId: "corr-1042-ord",
      },
    ],
  };

  const selectedDetail = props.selectedSkuDetail !== undefined 
    ? props.selectedSkuDetail 
    : (props.isDrawerOpen ? defaultSkuDetail : null);

  const drawerHtml = renderSkuDetailDrawer({
    id: "skuDetailDrawer",
    isOpen: Boolean(props.isDrawerOpen || props.selectedSkuDetail),
    skuDetail: selectedDetail || defaultSkuDetail,
  });

  // Client-Side Interaction Script for Drawer & Filter Chips
  const interactiveScript = `
    <script>
      (function() {
        // 1. Filter toggle chips (low stock & mismatch)
        const lowStockBtn = document.getElementById("filterLowStockToggle");
        const lowStockInput = document.getElementById("inputLowStock");
        const mismatchBtn = document.getElementById("filterMismatchToggle");
        const mismatchInput = document.getElementById("inputMismatch");
        const filterForm = document.getElementById("inventoryFilterForm");

        if (lowStockBtn && lowStockInput) {
          lowStockBtn.addEventListener("click", function() {
            const current = lowStockInput.value === "true";
            lowStockInput.value = current ? "false" : "true";
            lowStockBtn.classList.toggle("active", !current);
            lowStockBtn.setAttribute("aria-pressed", String(!current));
            filterForm.submit();
          });
        }

        if (mismatchBtn && mismatchInput) {
          mismatchBtn.addEventListener("click", function() {
            const current = mismatchInput.value === "true";
            mismatchInput.value = current ? "false" : "true";
            mismatchBtn.classList.toggle("active", !current);
            mismatchBtn.setAttribute("aria-pressed", String(!current));
            filterForm.submit();
          });
        }

        // 2. Open SKU Detail Drawer
        const drawerOverlay = document.getElementById("skuDetailDrawerOverlay");
        const drawerCloseBtn = document.getElementById("skuDrawerCloseBtn");

        function openDrawerForSku(sku) {
          if (drawerOverlay) {
            drawerOverlay.classList.remove("drawer-closed");
            drawerOverlay.classList.add("drawer-open");
            drawerOverlay.removeAttribute("hidden");
            drawerOverlay.removeAttribute("aria-hidden");

            // Update URL search query without reloading
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set("skuDetail", sku);
            window.history.pushState({}, "", currentUrl);
          }
        }

        function closeDrawer() {
          if (drawerOverlay) {
            drawerOverlay.classList.remove("drawer-open");
            drawerOverlay.classList.add("drawer-closed");
            drawerOverlay.setAttribute("hidden", "true");
            drawerOverlay.setAttribute("aria-hidden", "true");

            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.delete("skuDetail");
            window.history.pushState({}, "", currentUrl);
          }
        }

        document.querySelectorAll("[data-open-sku]").forEach(function(el) {
          el.addEventListener("click", function(e) {
            e.preventDefault();
            const sku = el.getAttribute("data-open-sku");
            openDrawerForSku(sku);
          });
        });

        if (drawerCloseBtn) {
          drawerCloseBtn.addEventListener("click", closeDrawer);
        }

        if (drawerOverlay) {
          drawerOverlay.addEventListener("click", function(e) {
            if (e.target === drawerOverlay) {
              closeDrawer();
            }
          });
        }

        // Close on ESC key (WCAG requirement)
        document.addEventListener("keydown", function(e) {
          if (e.key === "Escape" && drawerOverlay && drawerOverlay.classList.contains("drawer-open")) {
            closeDrawer();
          }
        });

        // 3. Tab switching inside drawer
        document.querySelectorAll(".drawer-nav-item").forEach(function(tab) {
          tab.addEventListener("click", function(e) {
            document.querySelectorAll(".drawer-nav-item").forEach(function(t) {
              t.classList.remove("active");
            });
            tab.classList.add("active");
          });
        });

        // 4. Pagination buttons
        const prevBtn = document.getElementById("invPrevPageBtn");
        const nextBtn = document.getElementById("invNextPageBtn");
        if (prevBtn) {
          prevBtn.addEventListener("click", function() {
            const page = prevBtn.getAttribute("data-goto-page");
            if (page && filterForm) {
              const input = document.createElement("input");
              input.type = "hidden";
              input.name = "page";
              input.value = page;
              filterForm.appendChild(input);
              filterForm.submit();
            }
          });
        }
        if (nextBtn) {
          nextBtn.addEventListener("click", function() {
            const page = nextBtn.getAttribute("data-goto-page");
            if (page && filterForm) {
              const input = document.createElement("input");
              input.type = "hidden";
              input.name = "page";
              input.value = page;
              filterForm.appendChild(input);
              filterForm.submit();
            }
          });
        }
      })();
    </script>
  `;

  return `
    <div class="page-header-row">
      <div class="page-title-group">
        <h1>Inventory Control</h1>
        <p>Authoritative multi-channel inventory positions, safety buffers, and dynamic provider synchronization.</p>
      </div>
      <div class="page-header-actions">
        <a href="/app/onboarding" class="btn btn-secondary btn-sm">Onboarding Wizard</a>
        <a href="/app/states-demo" class="btn btn-secondary btn-sm">UI States Demo</a>
        <button type="button" class="btn btn-primary btn-sm" id="btnManualAdjust">+ Manual Adjustment</button>
      </div>
    </div>

    ${tableHtml}
    ${drawerHtml}
    ${interactiveScript}
  `;
}

/**
 * Exceptions View: Dedicated drift and synchronization discrepancy inbox.
 */
export function renderExceptionsView(): string {
  return `
    <div class="page-header-row">
      <div class="page-title-group">
        <h1>Exception Inbox</h1>
        <p>Review, investigate, and reconcile inventory discrepancies across connected channels.</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-secondary btn-sm">Filter by Severity</button>
        <button class="btn btn-primary btn-sm">Run Full Reconciliation Audit</button>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: var(--space-4); max-width: 900px;">
      ${renderExceptionCard({
        id: "exc-8921",
        title: "Channel Quantity Mismatch Detected",
        description: "Shopify reports 42 units for SKU 'WIRELESS-HEADSET-BLK', but authoritative ledger asserts 38 available (4 reserved for Order #1042).",
        severity: "HIGH",
        sku: "WIRELESS-HEADSET-BLK",
        channel: "Shopify Store US",
        timestamp: "5 minutes ago",
        suggestedAction: "Push authoritative balance (38) to Shopify to prevent overselling.",
        resolutionOptions: [
          { id: "push-auth", label: "Push Ledger Balance", action: "sync_authoritative", variant: "primary" },
          { id: "recount", label: "Request Recount", action: "request_recount", variant: "secondary" },
          { id: "ignore", label: "Dismiss", action: "dismiss", variant: "secondary" }
        ]
      })}

      ${renderExceptionCard({
        id: "exc-8922",
        title: "Amazon SP-API Feed Verification Timeout",
        description: "Read-back verification for feed #98231 exceeded 300s window. External inventory acknowledged but not yet verified.",
        severity: "MEDIUM",
        sku: "USB-C-DOCK-PRO",
        channel: "Amazon NA",
        timestamp: "22 minutes ago",
        suggestedAction: "Re-poll feed processing status or dispatch background sync.",
        resolutionOptions: [
          { id: "repoll", label: "Check Status Now", action: "repoll_feed", variant: "primary" },
          { id: "retry", label: "Resubmit Feed", action: "resubmit", variant: "secondary" }
        ]
      })}
    </div>
  `;
}

/**
 * Orders View: DataTable showing orders and lifecycle states.
 */
export function renderOrdersView(): string {
  const sampleOrders = [
    {
      orderId: "ORD-98124",
      customer: "Acme Distribution",
      channel: "Shopify US",
      status: "RESERVED",
      skuCount: 2,
      createdAt: "10 mins ago"
    },
    {
      orderId: "ORD-98120",
      customer: "Global Retailers Ltd",
      channel: "Amazon NA",
      status: "ALLOCATED",
      skuCount: 4,
      createdAt: "45 mins ago"
    },
    {
      orderId: "ORD-98108",
      customer: "Pacific Supply",
      channel: "Shopify US",
      status: "FULFILLED",
      skuCount: 1,
      createdAt: "3 hours ago"
    }
  ];

  const tableHtml = renderDataTable({
    id: "orders-table",
    rowKey: "orderId",
    totalCount: 3,
    columns: [
      {
        key: "orderId",
        header: "Order ID",
        sortable: true,
        render: (row) => `<strong>${row.orderId}</strong>`
      },
      {
        key: "channel",
        header: "Channel",
        render: (row) => `<span>${row.channel}</span>`
      },
      {
        key: "status",
        header: "Lifecycle Status",
        render: (row) => renderStatusBadge({ status: row.status, category: "order" })
      },
      {
        key: "skuCount",
        header: "Items",
        render: (row) => `<span>${row.skuCount} SKUs</span>`
      },
      {
        key: "createdAt",
        header: "Date Placed",
        render: (row) => `<span style="color: var(--color-surface-muted); font-size: var(--text-xs);">${row.createdAt}</span>`
      }
    ],
    data: sampleOrders
  });

  return `
    <div class="page-header-row">
      <div class="page-title-group">
        <h1>Orders</h1>
        <p>Inbound sales channel orders with automatic ledger reservations and allocations.</p>
      </div>
    </div>
    ${tableHtml}
  `;
}

/**
 * Integrations View: Channel cards and sync status.
 */
export function renderIntegrationsView(): string {
  return `
    <div class="page-header-row">
      <div class="page-title-group">
        <h1>Channel Integrations</h1>
        <p>Connected marketplaces and e-commerce platforms synchronized with the central inventory ledger.</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary btn-sm">+ Connect New Channel</button>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: var(--space-6);">
      ${renderIntegrationCard({
        id: "shop-01",
        channelType: "shopify",
        channelName: "Shopify Store US",
        accountIdentifier: "acme-logistics.myshopify.com",
        status: "ACTIVE",
        syncHealth: "HEALTHY",
        skuCount: 4280,
        errorCount: 1,
        lastSyncAt: "3 mins ago"
      })}

      ${renderIntegrationCard({
        id: "amz-01",
        channelType: "amazon",
        channelName: "Amazon North America",
        accountIdentifier: "Seller ID: A29188172X",
        status: "ACTIVE",
        syncHealth: "HEALTHY",
        skuCount: 3105,
        lastSyncAt: "7 mins ago"
      })}

      ${renderIntegrationCard({
        id: "wmt-01",
        channelType: "walmart",
        channelName: "Walmart Marketplace",
        accountIdentifier: "Partner ID: 10098231",
        status: "ACTIVE",
        syncHealth: "HEALTHY",
        skuCount: 1200,
        lastSyncAt: "15 mins ago"
      })}
    </div>
  `;
}

/**
 * Billing View: Subscription tier, usage quotas, and Stripe Portal link.
 */
export function renderBillingView(): string {
  return `
    <div class="page-header-row">
      <div class="page-title-group">
        <h1>Subscription & Billing</h1>
        <p>Manage your organization tier, inventory quota allocations, and payment methods.</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary btn-sm">Open Stripe Customer Portal ↗</button>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-8);">
      ${renderMetricCard({
        title: "Active Tier",
        value: "Growth Plan",
        deltaDirection: "neutral",
        trendLabel: "$299 / month",
        footnote: "Renews on Oct 28, 2026"
      })}
      ${renderMetricCard({
        title: "Monthly Order Quota",
        value: "4,210 / 10,000",
        deltaDirection: "neutral",
        trendLabel: "42.1% utilized",
        footnote: "Never blocks critical sync operations"
      })}
      ${renderMetricCard({
        title: "Connected Channels",
        value: "3 / 5",
        deltaDirection: "neutral",
        trendLabel: "2 remaining",
        footnote: "Includes Shopify, Amazon, Walmart"
      })}
    </div>
  `;
}

/**
 * Universal 6-States Demo View: Showcases all 6 universal UI states side-by-side
 * for automated tests and human UX verification.
 */
export function renderStatesDemoView(): string {
  return `
    <div class="page-header-row">
      <div class="page-title-group">
        <h1>Universal 6-State UI Verification</h1>
        <p>Prompt 25 & Section 12 Mandate: Every production component/page must handle all 6 semantic states.</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--space-6);">
      <div class="card p-4">
        <h4 style="margin: 0 0 var(--space-3) 0;">1. Loading State</h4>
        ${renderUIState({
          type: "loading",
          title: "Synchronizing channel inventory...",
          message: "Authoritative ledger transactions in progress."
        })}
      </div>

      <div class="card p-4">
        <h4 style="margin: 0 0 var(--space-3) 0;">2. Empty State</h4>
        ${renderUIState({
          type: "empty",
          title: "No inventory records",
          message: "No inventory items have been configured yet.",
          actions: [{ label: "Import Catalog", variant: "primary" }]
        })}
      </div>

      <div class="card p-4">
        <h4 style="margin: 0 0 var(--space-3) 0;">3. Success State</h4>
        ${renderUIState({
          type: "success",
          title: "Ledger recount verified",
          message: "Balance verified against physical count with read-back verification.",
          actions: [{ label: "Return to Inventory", variant: "primary" }]
        })}
      </div>

      <div class="card p-4">
        <h4 style="margin: 0 0 var(--space-3) 0;">4. Error State</h4>
        ${renderUIState({
          type: "error",
          title: "Failed to connect provider",
          message: "Network socket timeout communicating with Shopify Admin API.",
          code: "PROVIDER_TIMEOUT",
          correlationId: "corr-err-9812",
          actions: [{ label: "Retry Connection", variant: "primary" }]
        })}
      </div>

      <div class="card p-4">
        <h4 style="margin: 0 0 var(--space-3) 0;">5. Partial Failure State</h4>
        ${renderUIState({
          type: "partial_failure",
          title: "Multi-channel broadcast partial failure",
          message: "3 of 4 channels synchronized successfully. Amazon feed rejected invalid SKU barcode.",
          details: { successfulChannels: ["shopify", "walmart", "ebay"], failedChannels: ["amazon"], reason: "INVALID_BARCODE_FORMAT" },
          actions: [{ label: "Retry Amazon Only", variant: "primary" }]
        })}
      </div>

      <div class="card p-4">
        <h4 style="margin: 0 0 var(--space-3) 0;">6. Permission Denied State</h4>
        ${renderUIState({
          type: "permission_denied",
          title: "Administrative Access Required",
          message: "Your role (Operator) does not have permission to execute manual balance adjustments without Manager approval.",
          code: "FORBIDDEN_PERMISSION_REQUIRED",
          actions: [{ label: "Request Elevation", variant: "primary" }]
        })}
      </div>
    </div>
  `;
}

export interface OnboardingViewOptions {
  currentStepId?: string;
  primaryChannel?: string;
  discrepanciesResolved?: boolean;
}

/**
 * Onboarding View: 9-step progressive merchant setup wizard with initial sync safety gate.
 * Canonical Specifications: Section 62, 63, 64 of 01_ENGINEERING_SPEC.md & Prompt 26
 */
export function renderOnboardingView(options: OnboardingViewOptions = {}): string {
  const currentStep = options.currentStepId || "VALIDATE_INVENTORY";
  const discrepanciesResolved = options.discrepanciesResolved ?? false;

  const steps: StepInfo[] = [
    { id: "CREATE_ACCOUNT", number: 1, label: "Account", status: "COMPLETED", description: "Identity verified" },
    { id: "CREATE_ORGANIZATION", number: 2, label: "Organization", status: "COMPLETED", description: "Acme Logistics Corp" },
    { 
      id: "CHOOSE_PRIMARY_CHANNEL", 
      number: 3, 
      label: "Sales Channel", 
      status: currentStep === "CHOOSE_PRIMARY_CHANNEL" ? "CURRENT" : "COMPLETED", 
      description: options.primaryChannel || "Shopify Store" 
    },
    { 
      id: "CONNECT_CHANNEL", 
      number: 4, 
      label: "Connect", 
      status: currentStep === "CONNECT_CHANNEL" ? "CURRENT" : (["CREATE_ACCOUNT", "CREATE_ORGANIZATION", "CHOOSE_PRIMARY_CHANNEL"].includes(currentStep) ? "BLOCKED" : "COMPLETED"), 
      description: "OAuth Authorized" 
    },
    { 
      id: "IMPORT_CATALOG", 
      number: 5, 
      label: "Import Catalog", 
      status: currentStep === "IMPORT_CATALOG" ? "CURRENT" : (["CREATE_ACCOUNT", "CREATE_ORGANIZATION", "CHOOSE_PRIMARY_CHANNEL", "CONNECT_CHANNEL"].includes(currentStep) ? "BLOCKED" : "COMPLETED"), 
      description: "15 SKUs detected" 
    },
    { 
      id: "MAP_SKUS", 
      number: 6, 
      label: "Map SKUs", 
      status: currentStep === "MAP_SKUS" ? "CURRENT" : (["CREATE_ACCOUNT", "CREATE_ORGANIZATION", "CHOOSE_PRIMARY_CHANNEL", "CONNECT_CHANNEL", "IMPORT_CATALOG"].includes(currentStep) ? "BLOCKED" : "COMPLETED"), 
      description: "100% mapped" 
    },
    { 
      id: "VALIDATE_INVENTORY", 
      number: 7, 
      label: "Validate Inventory", 
      status: currentStep === "VALIDATE_INVENTORY" 
        ? (discrepanciesResolved ? "COMPLETED" : "NEEDS_ATTENTION") 
        : (["ENABLE_SYNCHRONIZATION", "COMPLETED"].includes(currentStep) ? "COMPLETED" : "BLOCKED"), 
      description: discrepanciesResolved ? "All confirmed" : "Differences detected" 
    },
    { 
      id: "ENABLE_SYNCHRONIZATION", 
      number: 8, 
      label: "Enable Sync", 
      status: currentStep === "ENABLE_SYNCHRONIZATION" ? "CURRENT" : (currentStep === "COMPLETED" ? "COMPLETED" : "BLOCKED"), 
      description: "Safety guardrail" 
    },
    { 
      id: "COMPLETED", 
      number: 9, 
      label: "Dashboard", 
      status: currentStep === "COMPLETED" ? "COMPLETED" : "BLOCKED", 
      description: "Launchpad" 
    },
  ];

  let stepBodyHtml = "";

  switch (currentStep) {
    case "CHOOSE_PRIMARY_CHANNEL":
      stepBodyHtml = `
        <div class="card p-6" style="margin-top: var(--space-6);">
          <h3 style="margin-top: 0; margin-bottom: var(--space-2); font-size: var(--text-lg); font-weight: 700;">Step 3: Choose Primary Sales Channel</h3>
          <p style="color: var(--color-text-secondary); margin-bottom: var(--space-6);">
            Select the marketplace or eCommerce platform that serves as your primary product and inventory source.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
            <div class="card p-4 channel-select-card" style="border: 2px solid var(--color-primary); cursor: pointer;">
              <div style="font-weight: 700; font-size: var(--text-base); margin-bottom: 4px;">🛍️ Shopify</div>
              <div style="font-size: var(--text-xs); color: var(--color-text-secondary); margin-bottom: var(--space-3);">GraphQL Admin API (2025-01) with webhook synchronization.</div>
              <span class="badge badge-primary">Recommended</span>
            </div>
            <div class="card p-4 channel-select-card" style="border: 1px solid var(--color-border); cursor: pointer;">
              <div style="font-weight: 700; font-size: var(--text-base); margin-bottom: 4px;">📦 Amazon SP-API</div>
              <div style="font-size: var(--text-xs); color: var(--color-text-secondary); margin-bottom: var(--space-3);">Merchant-fulfilled network (MFN) and FBA inventory tracking.</div>
              <span class="badge badge-neutral">SP-API Supported</span>
            </div>
            <div class="card p-4 channel-select-card" style="border: 1px solid var(--color-border); cursor: pointer;">
              <div style="font-weight: 700; font-size: var(--text-base); margin-bottom: 4px;">🏷️ eBay</div>
              <div style="font-size: var(--text-xs); color: var(--color-text-secondary); margin-bottom: var(--space-3);">Multi-account OAuth 2.0 marketplace synchronization.</div>
              <span class="badge badge-neutral">Supported</span>
            </div>
            <div class="card p-4 channel-select-card" style="border: 1px solid var(--color-border); cursor: pointer;">
              <div style="font-weight: 700; font-size: var(--text-base); margin-bottom: 4px;">🏪 Walmart</div>
              <div style="font-size: var(--text-xs); color: var(--color-text-secondary); margin-bottom: var(--space-3);">Ship-node based feeds and inventory management.</div>
              <span class="badge badge-neutral">Supported</span>
            </div>
          </div>

          <a href="/app/onboarding?step=CONNECT_CHANNEL" class="btn btn-primary" id="btn-select-channel">
            Continue to Channel Connection →
          </a>
        </div>
      `;
      break;

    case "CONNECT_CHANNEL":
      stepBodyHtml = `
        <div class="card p-6" style="margin-top: var(--space-6);">
          <h3 style="margin-top: 0; margin-bottom: var(--space-2); font-size: var(--text-lg); font-weight: 700;">Step 4: Connect Channel Account</h3>
          <p style="color: var(--color-text-secondary); margin-bottom: var(--space-6);">
            Authenticate with your store to allow safe read-only catalog discovery. Outbound inventory updates will remain disabled until you validate stock levels.
          </p>

          <form action="/app/onboarding?step=IMPORT_CATALOG" method="GET" style="max-width: 520px; display: flex; flex-direction: column; gap: var(--space-4);">
            <div class="form-group">
              <label for="store-domain" class="form-label">Store Domain / Marketplace URL</label>
              <input type="text" id="store-domain" class="form-input" placeholder="acme-store.myshopify.com" value="acme-store.myshopify.com" required />
            </div>

            <div class="callout callout-info" style="padding: var(--space-3); border-radius: var(--radius-sm); background: var(--color-bg-secondary); font-size: var(--text-xs);">
              🔒 <strong>Encrypted Credential Storage:</strong> All OAuth tokens and API credentials are encrypted with AES-256-GCM.
            </div>

            <button type="submit" class="btn btn-primary" id="btn-connect-channel">
              Authenticate & Connect Account →
            </button>
          </form>
        </div>
      `;
      break;

    case "IMPORT_CATALOG":
      stepBodyHtml = `
        <div class="card p-6" style="margin-top: var(--space-6);">
          <h3 style="margin-top: 0; margin-bottom: var(--space-2); font-size: var(--text-lg); font-weight: 700;">Step 5: Catalog Ingestion</h3>
          <p style="color: var(--color-text-secondary); margin-bottom: var(--space-4);">
            Reading external product listings and catalog items from connected channel.
          </p>

          <div style="background: var(--color-bg-secondary); border-radius: var(--radius-md); padding: var(--space-4); margin-bottom: var(--space-6);">
            <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-2); font-size: var(--text-xs); font-weight: 600;">
              <span>Catalog Ingestion Status</span>
              <span style="color: var(--color-success);">✓ Ingested 15 of 15 Items (100%)</span>
            </div>
            <div style="height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: 100%; background: var(--color-success);"></div>
            </div>
          </div>

          <div class="callout" style="padding: var(--space-3); font-size: var(--text-xs); margin-bottom: var(--space-6); background: var(--color-bg-secondary); border-left: 3px solid var(--color-primary);">
            ℹ️ <strong>Catalog Integrity:</strong> Unmapped external SKUs will never be discarded. They will be staged for mapping and review.
          </div>

          <a href="/app/onboarding?step=MAP_SKUS" class="btn btn-primary" id="btn-proceed-map">
            Proceed to SKU Mapping →
          </a>
        </div>
      `;
      break;

    case "MAP_SKUS":
      stepBodyHtml = `
        <div class="card p-6" style="margin-top: var(--space-6);">
          <h3 style="margin-top: 0; margin-bottom: var(--space-2); font-size: var(--text-lg); font-weight: 700;">Step 6: Map SKUs & Product Identifiers</h3>
          <p style="color: var(--color-text-secondary); margin-bottom: var(--space-6);">
            Align channel SKUs to internal catalog products. All 15 external items have been matched to internal SKUs.
          </p>

          <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; margin-bottom: var(--space-6);">
            <table class="table" style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">
              <thead style="background: var(--color-bg-secondary);">
                <tr>
                  <th style="padding: var(--space-3); text-align: left;">External SKU</th>
                  <th style="padding: var(--space-3); text-align: left;">Title</th>
                  <th style="padding: var(--space-3); text-align: left;">Internal Catalog SKU</th>
                  <th style="padding: var(--space-3); text-align: center;">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: var(--space-3); font-family: monospace;">WIRELESS-HEADSET-BLK</td>
                  <td style="padding: var(--space-3);">Wireless Noise Cancelling Headset</td>
                  <td style="padding: var(--space-3); font-family: monospace; font-weight: 600;">WIRELESS-HEADSET-BLK</td>
                  <td style="padding: var(--space-3); text-align: center;"><span class="badge badge-success">MAPPED</span></td>
                </tr>
                <tr>
                  <td style="padding: var(--space-3); font-family: monospace;">USB-C-DOCK-PRO</td>
                  <td style="padding: var(--space-3);">Multi-Port USB-C Dock Pro</td>
                  <td style="padding: var(--space-3); font-family: monospace; font-weight: 600;">USB-C-DOCK-PRO</td>
                  <td style="padding: var(--space-3); text-align: center;"><span class="badge badge-success">MAPPED</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <a href="/app/onboarding?step=VALIDATE_INVENTORY" class="btn btn-primary" id="btn-proceed-validate">
            Confirm Mappings & Proceed to Inventory Validation →
          </a>
        </div>
      `;
      break;

    case "VALIDATE_INVENTORY":
      stepBodyHtml = `
        <div style="margin-top: var(--space-6);">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: var(--space-4);">
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: var(--text-lg); font-weight: 700;">Step 7: Validate Initial Inventory</h3>
              <p style="margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm);">
                Compare initial channel balances against your authoritative inventory ledger.
              </p>
            </div>
            <a href="/app/onboarding?step=ENABLE_SYNCHRONIZATION" class="btn btn-primary" id="btn-proceed-sync" ${!discrepanciesResolved ? 'style="pointer-events: auto;"' : ''}>
              ${discrepanciesResolved ? 'Continue to Synchronization →' : 'Resolve Differences to Continue'}
            </a>
          </div>

          ${renderDiscrepancyTable({
            channels: ["Shopify", "Amazon"],
            rows: [
              {
                sku: "WIRELESS-HEADSET-BLK",
                productTitle: "Wireless Noise Cancelling Headset",
                internalQuantity: 20,
                channelQuantities: { SHOPIFY: 20, AMAZON: 18 },
                discrepancy: true,
                chosenSourceOfTruth: discrepanciesResolved ? "INTERNAL_LEDGER" : undefined,
                resolvedQuantity: discrepanciesResolved ? 20 : undefined,
                confirmed: discrepanciesResolved,
              },
              {
                sku: "USB-C-DOCK-PRO",
                productTitle: "Multi-Port USB-C Dock Pro",
                internalQuantity: 50,
                channelQuantities: { SHOPIFY: 50, AMAZON: 50 },
                discrepancy: false,
                resolvedQuantity: 50,
                confirmed: true,
              },
            ],
          })}

          <div style="margin-top: var(--space-6); display: flex; justify-content: flex-end; gap: var(--space-3);">
            <a href="/app/onboarding?step=VALIDATE_INVENTORY&resolved=true" class="btn btn-secondary" id="btn-resolve-all">
              Apply Authoritative Ledger as Source of Truth
            </a>
            <a href="/app/onboarding?step=ENABLE_SYNCHRONIZATION" class="btn btn-primary" id="btn-confirm-baseline">
              Confirm Source of Truth Resolutions →
            </a>
          </div>
        </div>
      `;
      break;

    case "ENABLE_SYNCHRONIZATION":
      stepBodyHtml = `
        <div style="margin-top: var(--space-6); max-width: 780px;">
          <h3 style="margin: 0 0 var(--space-2) 0; font-size: var(--text-lg); font-weight: 700;">Step 8: Enable Outbound Synchronization</h3>
          <p style="margin: 0 0 var(--space-6) 0; color: var(--color-text-secondary); font-size: var(--text-sm);">
            Final safety confirmation before activating bi-directional inventory synchronization.
          </p>

          ${renderSyncConfirmationCard({
            unresolvedCount: discrepanciesResolved ? 0 : 0,
            totalSkusCount: 15,
            onConfirmActionUrl: "/app/onboarding?step=COMPLETED",
          })}
        </div>
      `;
      break;

    case "COMPLETED":
      stepBodyHtml = `
        <div class="card p-8" style="margin-top: var(--space-6); text-align: center; max-width: 640px; margin-left: auto; margin-right: auto;">
          <div style="font-size: 3.5rem; margin-bottom: var(--space-4);">🎉</div>
          <h2 style="font-size: var(--text-xl); font-weight: 700; margin-bottom: var(--space-2);">Merchant Onboarding Complete!</h2>
          <p style="color: var(--color-text-secondary); margin-bottom: var(--space-6); line-height: 1.5;">
            Your primary sales channel is connected, initial catalog is mapped, stock discrepancies have been resolved with verified sources of truth, and outbound synchronization is securely enabled.
          </p>
          <a href="/app/overview" class="btn btn-primary btn-lg" id="btn-go-dashboard">
            Launch Platform Dashboard →
          </a>
        </div>
      `;
      break;

    default:
      stepBodyHtml = `<div class="card p-6"><p>Unknown step: ${currentStep}</p></div>`;
  }

  return `
    <div class="onboarding-page-container" style="max-width: 1040px; margin: 0 auto; padding: var(--space-6) 0;">
      <div class="page-header" style="margin-bottom: var(--space-6);">
        <h1 style="font-size: var(--text-2xl); font-weight: 800; margin: 0 0 6px 0;">Merchant Onboarding Wizard</h1>
        <p style="color: var(--color-text-secondary); margin: 0; font-size: var(--text-sm);">
          Set up your multichannel sales architecture with transactional inventory integrity.
        </p>
      </div>

      ${renderOnboardingStepper({
        currentStepId: currentStep,
        steps,
      })}

      ${stepBodyHtml}
    </div>
  `;
}
