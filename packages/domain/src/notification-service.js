"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEVERITY_LEVELS = void 0;
exports.createDefaultNotificationPreferences = createDefaultNotificationPreferences;
exports.isRoutineSuccessEvent = isRoutineSuccessEvent;
exports.generateIncidentKey = generateIncidentKey;
exports.shouldDeduplicateIncident = shouldDeduplicateIncident;
exports.aggregateIncidentNotification = aggregateIncidentNotification;
exports.isChannelDeliveryPermitted = isChannelDeliveryPermitted;
exports.SEVERITY_LEVELS = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
};
/**
 * Creates default notification preferences for a tenant/user.
 */
function createDefaultNotificationPreferences(organizationId, userId) {
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
function isRoutineSuccessEvent(eventTypeOrAction) {
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
function generateIncidentKey(category, entityType, entityId) {
    return `${category}:${entityType || "general"}:${entityId || "all"}`;
}
/**
 * Checks whether an incoming failure event falls within the sliding deduplication window.
 * Default deduplication window: 20 minutes (1200 seconds) according to Prompt 23.
 */
function shouldDeduplicateIncident(lastIncidentTime, currentTime = new Date(), windowSeconds = 20 * 60) {
    const diffMs = currentTime.getTime() - lastIncidentTime.getTime();
    return diffMs >= 0 && diffMs <= windowSeconds * 1000;
}
/**
 * Aggregates an incoming failure into an existing incident summary notification.
 */
function aggregateIncidentNotification(existing, newTitle, newMessage, newEntityId, currentTime = new Date()) {
    const updatedCount = existing.occurrenceCount + 1;
    const existingEntities = existing.metadata?.["affectedEntities"] || [];
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
function isChannelDeliveryPermitted(preferences, category, severity, channel) {
    // 1. Check if category is enabled
    const categoryEnabled = preferences.categoryPreferences[category] ?? true;
    if (!categoryEnabled)
        return false;
    // 2. Channel specific checks
    if (channel === "IN_APP") {
        return preferences.inAppEnabled;
    }
    if (channel === "EMAIL") {
        if (!preferences.emailEnabled)
            return false;
        // Check minimum severity threshold for email
        const eventSeverityRank = exports.SEVERITY_LEVELS[severity] ?? 1;
        const minSeverityRank = exports.SEVERITY_LEVELS[preferences.minEmailSeverity] ?? 2;
        return eventSeverityRank >= minSeverityRank;
    }
    return false;
}
//# sourceMappingURL=notification-service.js.map