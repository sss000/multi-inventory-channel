import {
  NotificationCategory,
  NotificationChannel,
  NotificationSeverity,
  NotificationStatus,
} from "@platform/contracts";

/**
 * Pure Domain Notification Logic & Deduplication Engine
 * Canonical Specification: Section 76 of 01_ENGINEERING_SPEC.md & Prompt 23 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 */

export interface DomainNotification {
  id: string;
  organizationId: string;
  userId?: string | null;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  status: NotificationStatus;
  channels: NotificationChannel[];
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  incidentKey?: string | null;
  occurrenceCount: number;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  readAt?: Date | null;
}

export interface DomainNotificationPreferences {
  organizationId: string;
  userId?: string | null;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  categoryPreferences: Record<NotificationCategory, boolean>;
  minEmailSeverity: NotificationSeverity;
  updatedAt: Date;
}

export const SEVERITY_LEVELS: Record<NotificationSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Creates default notification preferences for a tenant/user.
 */
export function createDefaultNotificationPreferences(
  organizationId: string,
  userId?: string | null
): DomainNotificationPreferences {
  return {
    organizationId,
    userId: userId ?? null,
    inAppEnabled: true,
    emailEnabled: true,
    categoryPreferences: {
      CRITICAL_INVENTORY_CONFLICT: true,
      INTEGRATION_AUTHENTICATION: true,
      REPEATED_SYNC_FAILURE: true,
      LOW_STOCK: true,
      NEGATIVE_INVENTORY: true,
      RECONCILIATION_REQUIRED: true,
      BILLING: true,
    },
    minEmailSeverity: "MEDIUM",
    updatedAt: new Date(),
  };
}

/**
 * Evaluates whether an event represents a routine background success operation.
 * SPECIFICATION LAW (Prompt 23 & Section 76):
 * "Do not notify users for every successful background operation."
 */
export function isRoutineSuccessEvent(eventTypeOrAction: string): boolean {
  const normalized = eventTypeOrAction.toUpperCase();
  const routineSuccessActions = [
    "SYNC_JOB_COMPLETED",
    "SYNC_SUCCESS",
    "INVENTORY_SYNC_SUCCESS",
    "ORDER_IMPORT_SUCCESS",
    "READ_BACK_VERIFIED",
    "HEARTBEAT_SUCCESS",
    "RECONCILIATION_MATCH",
    "BACKGROUND_POLL_OK",
    "TOKEN_REFRESH_SUCCESS",
  ];

  return routineSuccessActions.includes(normalized) || normalized.endsWith("_SUCCESS") || normalized.endsWith("_OK");
}

/**
 * Generates a deterministic incident deduplication key.
 * Prompt 23: Deduplicate repeated failures (e.g., 14 SKUs failing against Shopify over 20 minutes).
 */
export function generateIncidentKey(
  category: NotificationCategory,
  entityType?: string | null,
  entityId?: string | null
): string {
  return `${category}:${entityType || "general"}:${entityId || "all"}`;
}

/**
 * Checks whether an incoming failure event falls within the sliding deduplication window.
 * Default deduplication window: 20 minutes (1200 seconds) according to Prompt 23.
 */
export function shouldDeduplicateIncident(
  lastIncidentTime: Date,
  currentTime: Date = new Date(),
  windowSeconds: number = 20 * 60
): boolean {
  const diffMs = currentTime.getTime() - lastIncidentTime.getTime();
  return diffMs >= 0 && diffMs <= windowSeconds * 1000;
}

/**
 * Aggregates an incoming failure into an existing incident summary notification.
 */
export function aggregateIncidentNotification(
  existing: DomainNotification,
  newTitle: string,
  newMessage: string,
  newEntityId?: string,
  currentTime: Date = new Date()
): DomainNotification {
  const updatedCount = existing.occurrenceCount + 1;
  const existingEntities = (existing.metadata?.["affectedEntities"] as string[]) || [];
  const updatedEntities = newEntityId && !existingEntities.includes(newEntityId)
    ? [...existingEntities, newEntityId]
    : existingEntities;

  return {
    ...existing,
    occurrenceCount: updatedCount,
    title: `Incident Alert (${updatedCount} occurrences): ${existing.category.replace(/_/g, " ")}`,
    message: `${existing.message} (Latest: ${newMessage})`,
    metadata: {
      ...existing.metadata,
      affectedEntities: updatedEntities,
      lastOccurrenceAt: currentTime.toISOString(),
      aggregatedCount: updatedCount,
    },
    // Escalate severity if repeated failures exceed threshold
    severity: updatedCount >= 5 ? "CRITICAL" : existing.severity,
  };
}

/**
 * Determines whether a notification is permitted to be delivered over a given channel
 * based on user/tenant preferences.
 */
export function isChannelDeliveryPermitted(
  preferences: DomainNotificationPreferences,
  category: NotificationCategory,
  severity: NotificationSeverity,
  channel: NotificationChannel
): boolean {
  // 1. Check if category is enabled
  const categoryEnabled = preferences.categoryPreferences[category] ?? true;
  if (!categoryEnabled) return false;

  // 2. Channel specific checks
  if (channel === "IN_APP") {
    return preferences.inAppEnabled;
  }

  if (channel === "EMAIL") {
    if (!preferences.emailEnabled) return false;
    // Check minimum severity threshold for email
    const eventSeverityRank = SEVERITY_LEVELS[severity] ?? 1;
    const minSeverityRank = SEVERITY_LEVELS[preferences.minEmailSeverity] ?? 2;
    return eventSeverityRank >= minSeverityRank;
  }

  return false;
}
