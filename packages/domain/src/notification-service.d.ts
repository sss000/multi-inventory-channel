import { NotificationCategory, NotificationChannel, NotificationSeverity, NotificationStatus } from "@platform/contracts";
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
export declare const SEVERITY_LEVELS: Record<NotificationSeverity, number>;
/**
 * Creates default notification preferences for a tenant/user.
 */
export declare function createDefaultNotificationPreferences(organizationId: string, userId?: string | null): DomainNotificationPreferences;
/**
 * Evaluates whether an event represents a routine background success operation.
 * SPECIFICATION LAW (Prompt 23 & Section 76):
 * "Do not notify users for every successful background operation."
 */
export declare function isRoutineSuccessEvent(eventTypeOrAction: string): boolean;
/**
 * Generates a deterministic incident deduplication key.
 * Prompt 23: Deduplicate repeated failures (e.g., 14 SKUs failing against Shopify over 20 minutes).
 */
export declare function generateIncidentKey(category: NotificationCategory, entityType?: string | null, entityId?: string | null): string;
/**
 * Checks whether an incoming failure event falls within the sliding deduplication window.
 * Default deduplication window: 20 minutes (1200 seconds) according to Prompt 23.
 */
export declare function shouldDeduplicateIncident(lastIncidentTime: Date, currentTime?: Date, windowSeconds?: number): boolean;
/**
 * Aggregates an incoming failure into an existing incident summary notification.
 */
export declare function aggregateIncidentNotification(existing: DomainNotification, newTitle: string, newMessage: string, newEntityId?: string, currentTime?: Date): DomainNotification;
/**
 * Determines whether a notification is permitted to be delivered over a given channel
 * based on user/tenant preferences.
 */
export declare function isChannelDeliveryPermitted(preferences: DomainNotificationPreferences, category: NotificationCategory, severity: NotificationSeverity, channel: NotificationChannel): boolean;
//# sourceMappingURL=notification-service.d.ts.map