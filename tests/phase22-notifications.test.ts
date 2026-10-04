/**
 * Phase 22: Notifications Acceptance Test Suite
 * Canonical Specification: Section 76 of 01_ENGINEERING_SPEC.md & Prompt 23 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 *
 * Verifies:
 * 1. V1 Channels:
 *    - In-app notification inbox.
 *    - Email dispatch via provider interface.
 * 2. The 7 Canonical Notification Categories:
 *    - CRITICAL_INVENTORY_CONFLICT
 *    - INTEGRATION_AUTHENTICATION
 *    - REPEATED_SYNC_FAILURE
 *    - LOW_STOCK
 *    - NEGATIVE_INVENTORY
 *    - RECONCILIATION_REQUIRED
 *    - BILLING
 * 3. Intelligent Deduplication & Sliding Window (Prompt 23 Gate):
 *    - Collapses repeated failures (e.g., 14 SKUs failing against Shopify in 20 minutes) into an incident summary.
 *    - Suppresses repetitive email noise.
 * 4. Routine Operation Noise Reduction:
 *    - Strictly suppresses notifications for routine successful background operations.
 * 5. Notification Preferences:
 *    - Channel toggles (in-app vs email).
 *    - Category filtering.
 *    - Minimum severity threshold for emails (LOW, MEDIUM, HIGH, CRITICAL).
 * 6. Delivery Failure & Retry Handling:
 *    - Records delivery status, handles provider timeouts/failures gracefully.
 * 7. Multi-Tenant Isolation:
 *    - Organization A and Organization B notifications and preferences are strictly isolated.
 * 8. REST API Endpoints & RBAC:
 *    - GET /notifications (filtering, pagination)
 *    - GET /notifications/unread-count
 *    - PATCH /notifications/:id/read
 *    - POST /notifications/mark-all-read
 *    - DELETE /notifications/:id (dismiss)
 *    - GET /notifications/preferences
 *    - PUT /notifications/preferences
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type {
  NotificationCategory,
  NotificationChannel,
  NotificationSeverity,
  NotificationStatus,
  NotificationDto,
  NotificationPreferencesDto,
} from "@platform/contracts";

import {
  isRoutineSuccessEvent,
  generateIncidentKey,
  shouldDeduplicateIncident,
  aggregateIncidentNotification,
  isChannelDeliveryPermitted,
  createDefaultNotificationPreferences,
  NotificationNotFoundError,
} from "@platform/domain";
import type {
  DomainNotification,
  DomainNotificationPreferences,
} from "@platform/domain";

import {
  NotificationDatabaseService,
  InMemoryNotificationRepository,
} from "@platform/database";

import { MockEmailDispatchProvider } from "@platform/integrations";
import { startApiServer } from "@platform/api";
import { SupabaseAuthAdapter } from "@platform/security";

const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
const USER_ADMIN_A = "user_admin_org_a";
const USER_VIEWER_A = "user_viewer_org_a";
const USER_OPERATOR_A = "user_operator_org_a";
const USER_ADMIN_B = "user_admin_org_b";

function createMockAuthAdapter(): SupabaseAuthAdapter {
  const client = {
    auth: {
      getUser: async (token: string) => {
        if (token === "token_admin_org_a") {
          return {
            data: {
              user: {
                id: USER_ADMIN_A,
                email: "admin@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "ADMIN",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_viewer_org_a") {
          return {
            data: {
              user: {
                id: USER_VIEWER_A,
                email: "viewer@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "VIEWER",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_operator_org_a") {
          return {
            data: {
              user: {
                id: USER_OPERATOR_A,
                email: "operator@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "OPERATOR",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_admin_org_b") {
          return {
            data: {
              user: {
                id: USER_ADMIN_B,
                email: "admin@orgb.com",
                user_metadata: {
                  organization_id: ORG_B_ID,
                  organization_name: "Org B",
                  role: "ADMIN",
                },
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: { message: "Invalid token" } };
      },
    },
  };
  return new SupabaseAuthAdapter(client as any);
}

describe("Phase 22: Notifications System Acceptance Suite", () => {
  let notificationRepo: InMemoryNotificationRepository;
  let emailProvider: MockEmailDispatchProvider;
  let notificationDbService: NotificationDatabaseService;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    notificationRepo = new InMemoryNotificationRepository();
    emailProvider = new MockEmailDispatchProvider();
    notificationDbService = new NotificationDatabaseService(notificationRepo, emailProvider);

    const authAdapter = createMockAuthAdapter();
    server = startApiServer({
      portOverride: 0,
      authAdapter,
      notificationDbService,
    });

    await new Promise<void>((resolve) => {
      server.on("listening", resolve);
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // =========================================================================
  // 1. THE 7 CANONICAL NOTIFICATION CATEGORIES
  // =========================================================================
  describe("1. Canonical Notification Categories (Section 76 & Prompt 23)", () => {
    const categories: NotificationCategory[] = [
      "CRITICAL_INVENTORY_CONFLICT",
      "INTEGRATION_AUTHENTICATION",
      "REPEATED_SYNC_FAILURE",
      "LOW_STOCK",
      "NEGATIVE_INVENTORY",
      "RECONCILIATION_REQUIRED",
      "BILLING",
    ];

    for (const category of categories) {
      it(`should successfully dispatch notification for category: ${category}`, async () => {
        const notif = await notificationDbService.notify({
          organizationId: ORG_A_ID,
          category,
          severity: "HIGH",
          title: `Alert for ${category}`,
          message: `Detailed diagnostic for ${category} alert`,
          channels: ["IN_APP", "EMAIL"],
        });

        assert.ok(notif, `Notification created for ${category}`);
        assert.equal(notif.category, category);
        assert.equal(notif.status, "UNREAD");
        assert.equal(notif.channels.includes("IN_APP"), true);
        assert.equal(notif.channels.includes("EMAIL"), true);
        assert.equal(notif.emailDeliveryStatus, "DELIVERED");
      });
    }
  });

  // =========================================================================
  // 2. INTELLIGENT DEDUPLICATION & NOISE REDUCTION
  // =========================================================================
  describe("2. Intelligent Deduplication & Noise Reduction (Prompt 23 Canonical Gate)", () => {
    it("should collapse 14 repeated SKU sync failures against the same provider into 1 incident summary", async () => {
      emailProvider.clear();

      // Dispatch 14 failures within 20 minutes for Shopify channel
      const provider = "shopify_us";
      for (let i = 1; i <= 14; i++) {
        await notificationDbService.notify({
          organizationId: ORG_A_ID,
          category: "REPEATED_SYNC_FAILURE",
          severity: "HIGH",
          title: `Sync Failed for SKU_${i}`,
          message: `Provider ${provider} rejected inventory update for SKU_${i}`,
          entityType: "channel_account",
          entityId: provider,
          metadata: { skuId: `SKU_${i}` },
        });
      }

      // Check in-app notifications: should be exactly 1 aggregated notification
      const list = await notificationDbService.list(ORG_A_ID);
      assert.equal(list.total, 1, "Expected exactly 1 aggregated notification instead of 14 separate notifications");

      const incident = list.items[0];
      assert.equal(incident.occurrenceCount, 14);
      assert.ok(incident.title.includes("14 occurrences"));
      assert.equal(incident.severity, "CRITICAL", "Should escalate to CRITICAL after repeated failures");

      // Check email provider: should NOT send 14 emails
      // Only initial failure dispatches email (and optionally critical escalation, but not 14)
      assert.ok(
        emailProvider.sentEmails.length < 14,
        `Expected deduplicated email dispatch, got ${emailProvider.sentEmails.length} emails`
      );
    });

    it("should create a new incident when failure occurs AFTER deduplication window (>20 minutes)", async () => {
      // Create initial incident at T - 25 minutes
      const pastTime = new Date(Date.now() - 25 * 60 * 1000);
      await notificationRepo.createNotification({
        id: "notif_past_incident",
        organization_id: ORG_A_ID,
        user_id: null,
        category: "REPEATED_SYNC_FAILURE",
        severity: "HIGH",
        title: "Old failure",
        message: "Old failure message",
        status: "UNREAD",
        channels: ["IN_APP"],
        email_delivery_status: null,
        entity_type: "channel_account",
        entity_id: "ebay_us",
        action_url: null,
        incident_key: "REPEATED_SYNC_FAILURE:channel_account:ebay_us",
        occurrence_count: 1,
        metadata: null,
        created_at: pastTime.toISOString(),
        read_at: null,
        updated_at: pastTime.toISOString(),
      });

      // Dispatch failure now (25 minutes later)
      await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "REPEATED_SYNC_FAILURE",
        severity: "HIGH",
        title: "New failure after window",
        message: "New failure message",
        entityType: "channel_account",
        entityId: "ebay_us",
      });

      const list = await notificationDbService.list(ORG_A_ID);
      assert.equal(list.total, 2, "Expected 2 distinct incident records because the 20-minute window expired");
    });

    it("SPECIFICATION INVARIANT: should NOT notify users for routine background success operations", async () => {
      const routineActions = [
        "SYNC_JOB_COMPLETED",
        "SYNC_SUCCESS",
        "INVENTORY_SYNC_SUCCESS",
        "ORDER_IMPORT_SUCCESS",
        "READ_BACK_VERIFIED",
        "HEARTBEAT_SUCCESS",
      ];

      for (const action of routineActions) {
        const notif = await notificationDbService.notify({
          organizationId: ORG_A_ID,
          category: "REPEATED_SYNC_FAILURE",
          severity: "LOW",
          title: action,
          message: "Operation completed with 0 errors",
        });

        assert.equal(notif, null, `Routine operation '${action}' must not produce a notification`);
      }

      const list = await notificationDbService.list(ORG_A_ID);
      assert.equal(list.total, 0, "No notifications should exist for routine successes");
    });
  });

  // =========================================================================
  // 3. NOTIFICATION PREFERENCES ENGINE
  // =========================================================================
  describe("3. Notification Preferences Engine", () => {
    it("should provide sensible defaults (all enabled, min email severity MEDIUM)", async () => {
      const prefs = await notificationDbService.getPreferences(ORG_A_ID);
      assert.equal(prefs.inAppEnabled, true);
      assert.equal(prefs.emailEnabled, true);
      assert.equal(prefs.minEmailSeverity, "MEDIUM");
      assert.equal(prefs.categoryPreferences.CRITICAL_INVENTORY_CONFLICT, true);
      assert.equal(prefs.categoryPreferences.LOW_STOCK, true);
    });

    it("should suppress notification when category is disabled in preferences", async () => {
      // Disable LOW_STOCK alerts
      await notificationDbService.updatePreferences(ORG_A_ID, null, {
        categoryPreferences: { LOW_STOCK: false } as any,
      });

      const notif = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "LOW_STOCK",
        severity: "HIGH",
        title: "Low Stock Alert: SKU-123",
        message: "Available quantity is below reorder point",
      });

      assert.equal(notif, null, "Notification should be suppressed when category is disabled");
    });

    it("should suppress email dispatch when severity is below minEmailSeverity", async () => {
      emailProvider.clear();

      // Configure minEmailSeverity to CRITICAL
      await notificationDbService.updatePreferences(ORG_A_ID, null, {
        minEmailSeverity: "CRITICAL",
      });

      // Dispatch MEDIUM severity alert
      const notif = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "LOW_STOCK",
        severity: "MEDIUM",
        title: "Low stock alert",
        message: "5 units left",
      });

      assert.ok(notif, "In-app notification should still be created");
      assert.equal(notif.channels.includes("IN_APP"), true);
      assert.equal(notif.channels.includes("EMAIL"), false, "Email channel must be filtered out for MEDIUM severity");
      assert.equal(emailProvider.sentEmails.length, 0, "No email should be dispatched for MEDIUM severity");
    });

    it("should suppress in-app delivery when inAppEnabled is false", async () => {
      await notificationDbService.updatePreferences(ORG_A_ID, null, {
        inAppEnabled: false,
        emailEnabled: true,
      });

      const notif = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "CRITICAL_INVENTORY_CONFLICT",
        severity: "CRITICAL",
        title: "Severe discrepancy",
        message: "Discrepancy detected",
      });

      assert.ok(notif);
      assert.equal(notif.channels.includes("IN_APP"), false);
      assert.equal(notif.channels.includes("EMAIL"), true);
    });
  });

  // =========================================================================
  // 4. DELIVERY FAILURE & RETRY BEHAVIOR
  // =========================================================================
  describe("4. Delivery Failure & Retry Behavior", () => {
    it("should record email delivery failure gracefully when transport fails", async () => {
      emailProvider.shouldFailNext = 1; // Inject failure

      const notif = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "BILLING",
        severity: "CRITICAL",
        title: "Invoice Past Due",
        message: "Subscription payment failed",
        channels: ["EMAIL"],
      });

      assert.ok(notif);
      assert.equal(notif.emailDeliveryStatus, "FAILED");
    });
  });

  // =========================================================================
  // 5. NOTIFICATION LIFECYCLE & STATE
  // =========================================================================
  describe("5. Notification Lifecycle & State Transitions", () => {
    it("should mark single notification as read and update unread count", async () => {
      const notif = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "LOW_STOCK",
        severity: "HIGH",
        title: "Stock low",
        message: "Stock below 5",
      });
      assert.ok(notif);

      let unreadCount = await notificationDbService.getUnreadCount(ORG_A_ID);
      assert.equal(unreadCount, 1);

      const readNotif = await notificationDbService.markAsRead(ORG_A_ID, notif.id);
      assert.equal(readNotif.status, "READ");
      assert.ok(readNotif.readAt !== null);

      unreadCount = await notificationDbService.getUnreadCount(ORG_A_ID);
      assert.equal(unreadCount, 0);
    });

    it("should mark all notifications as read in bulk", async () => {
      await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "LOW_STOCK",
        severity: "HIGH",
        title: "Alert 1",
        message: "Message 1",
      });
      await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "BILLING",
        severity: "HIGH",
        title: "Alert 2",
        message: "Message 2",
      });

      let count = await notificationDbService.getUnreadCount(ORG_A_ID);
      assert.equal(count, 2);

      const marked = await notificationDbService.markAllAsRead(ORG_A_ID);
      assert.equal(marked, 2);

      count = await notificationDbService.getUnreadCount(ORG_A_ID);
      assert.equal(count, 0);
    });

    it("should dismiss notification", async () => {
      const notif = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "NEGATIVE_INVENTORY",
        severity: "CRITICAL",
        title: "Negative stock",
        message: "Available is -2",
      });
      assert.ok(notif);

      await notificationDbService.dismiss(ORG_A_ID, notif.id);

      const found = await notificationRepo.findById(ORG_A_ID, notif.id);
      assert.equal(found?.status, "DISMISSED");
    });
  });

  // =========================================================================
  // 6. MULTI-TENANT ISOLATION
  // =========================================================================
  describe("6. Multi-Tenant Isolation Enforcement", () => {
    it("should strictly prevent Org B from viewing or mutating Org A notifications", async () => {
      // Create notification for Org A
      const notifA = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "BILLING",
        severity: "HIGH",
        title: "Org A Billing Alert",
        message: "Org A Secret Details",
      });
      assert.ok(notifA);

      // Org B should have 0 notifications
      const listB = await notificationDbService.list(ORG_B_ID);
      assert.equal(listB.total, 0);

      // Org B attempting to mark Org A notification as read throws NotificationNotFoundError
      await assert.rejects(
        () => notificationDbService.markAsRead(ORG_B_ID, notifA.id),
        NotificationNotFoundError
      );
    });
  });

  // =========================================================================
  // 7. REST API ENDPOINTS & RBAC CONFORMANCE
  // =========================================================================
  describe("7. REST API Endpoints & RBAC Conformance", () => {
    it("GET /notifications should return notification list with envelope for all roles", async () => {
      await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "LOW_STOCK",
        severity: "HIGH",
        title: "Low stock alert",
        message: "Stock below 10",
      });

      // ADMIN
      const resAdmin = await fetch(`${baseUrl}/notifications`, {
        headers: { authorization: "Bearer token_admin_org_a" },
      });
      assert.equal(resAdmin.status, 200);
      const bodyAdmin = (await resAdmin.json()) as { data: NotificationDto[]; meta: { pagination: { total: number } } };
      assert.equal(bodyAdmin.data.length, 1);
      assert.equal(bodyAdmin.data[0].category, "LOW_STOCK");

      // VIEWER has notifications:read
      const resViewer = await fetch(`${baseUrl}/notifications`, {
        headers: { authorization: "Bearer token_viewer_org_a" },
      });
      assert.equal(resViewer.status, 200);

      // OPERATOR has notifications:read
      const resOperator = await fetch(`${baseUrl}/notifications`, {
        headers: { authorization: "Bearer token_operator_org_a" },
      });
      assert.equal(resOperator.status, 200);
    });

    it("GET /notifications/unread-count should return unread badge count", async () => {
      await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "CRITICAL_INVENTORY_CONFLICT",
        severity: "CRITICAL",
        title: "Conflict",
        message: "Discrepancy found",
      });

      const res = await fetch(`${baseUrl}/notifications/unread-count`, {
        headers: { authorization: "Bearer token_admin_org_a" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { unreadCount: number } };
      assert.equal(body.data.unreadCount, 1);
    });

    it("PATCH /notifications/:id/read should mark notification as read", async () => {
      const notif = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "BILLING",
        severity: "HIGH",
        title: "Invoice ready",
        message: "Monthly invoice",
      });
      assert.ok(notif);

      const res = await fetch(`${baseUrl}/notifications/${notif.id}/read`, {
        method: "PATCH",
        headers: { authorization: "Bearer token_admin_org_a" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: NotificationDto };
      assert.equal(body.data.status, "READ");
    });

    it("POST /notifications/mark-all-read should mark all read in bulk", async () => {
      await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "LOW_STOCK",
        severity: "LOW",
        title: "Alert 1",
        message: "Message 1",
      });

      const res = await fetch(`${baseUrl}/notifications/mark-all-read`, {
        method: "POST",
        headers: { authorization: "Bearer token_admin_org_a" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { markedCount: number } };
      assert.equal(body.data.markedCount >= 1, true);
    });

    it("DELETE /notifications/:id should dismiss notification", async () => {
      const notif = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "LOW_STOCK",
        severity: "LOW",
        title: "Alert to dismiss",
        message: "Dismiss this",
      });
      assert.ok(notif);

      const res = await fetch(`${baseUrl}/notifications/${notif.id}`, {
        method: "DELETE",
        headers: { authorization: "Bearer token_admin_org_a" },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { success: boolean };
      assert.equal(body.success, true);
    });

    it("GET & PUT /notifications/preferences should get and update preferences", async () => {
      // GET
      const resGet = await fetch(`${baseUrl}/notifications/preferences`, {
        headers: { authorization: "Bearer token_admin_org_a" },
      });
      assert.equal(resGet.status, 200);
      const bodyGet = (await resGet.json()) as { data: NotificationPreferencesDto };
      assert.equal(bodyGet.data.inAppEnabled, true);

      // PUT (ADMIN has notifications:manage)
      const resPut = await fetch(`${baseUrl}/notifications/preferences`, {
        method: "PUT",
        headers: {
          authorization: "Bearer token_admin_org_a",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          minEmailSeverity: "HIGH",
        }),
      });
      assert.equal(resPut.status, 200);
      const bodyPut = (await resPut.json()) as { data: NotificationPreferencesDto };
      assert.equal(bodyPut.data.minEmailSeverity, "HIGH");

      // VIEWER lacks notifications:manage -> 403 Forbidden
      const resViewerPut = await fetch(`${baseUrl}/notifications/preferences`, {
        method: "PUT",
        headers: {
          authorization: "Bearer token_viewer_org_a",
          "content-type": "application/json",
        },
        body: JSON.stringify({ minEmailSeverity: "LOW" }),
      });
      assert.equal(resViewerPut.status, 403);
    });

    it("HTTP Tenant Isolation: Org B user is forbidden from accessing Org A notification", async () => {
      const notifA = await notificationDbService.notify({
        organizationId: ORG_A_ID,
        category: "BILLING",
        severity: "HIGH",
        title: "Org A Alert",
        message: "Secret info",
      });
      assert.ok(notifA);

      // Org B user attempts to mark Org A notification as read -> 404 NOT_FOUND
      const res = await fetch(`${baseUrl}/notifications/${notifA.id}/read`, {
        method: "PATCH",
        headers: { authorization: "Bearer token_admin_org_b" },
      });
      assert.equal(res.status, 404);
    });
  });
});
