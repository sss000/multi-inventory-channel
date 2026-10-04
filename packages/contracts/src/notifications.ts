import { z } from "zod";

/**
 * Notifications Contracts & Enums
 * Canonical Specification: Section 76 of 01_ENGINEERING_SPEC.md & Prompt 23 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 */

export const NotificationChannelSchema = z.enum(["IN_APP", "EMAIL"]);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationCategorySchema = z.enum([
  "CRITICAL_INVENTORY_CONFLICT",
  "INTEGRATION_AUTHENTICATION",
  "REPEATED_SYNC_FAILURE",
  "LOW_STOCK",
  "NEGATIVE_INVENTORY",
  "RECONCILIATION_REQUIRED",
  "BILLING",
]);
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

export const NotificationSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>;

export const NotificationStatusSchema = z.enum(["UNREAD", "READ", "DISMISSED"]);
export type NotificationStatus = z.infer<typeof NotificationStatusSchema>;

export const DeliveryStatusSchema = z.enum(["PENDING", "DELIVERED", "FAILED"]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const NotificationDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string().nullable().optional(),
  category: NotificationCategorySchema,
  severity: NotificationSeveritySchema,
  title: z.string(),
  message: z.string(),
  status: NotificationStatusSchema,
  channels: z.array(NotificationChannelSchema),
  emailDeliveryStatus: DeliveryStatusSchema.nullable().optional(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  actionUrl: z.string().nullable().optional(),
  incidentKey: z.string().nullable().optional(),
  occurrenceCount: z.number().int().nonnegative().default(1),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
  readAt: z.string().nullable().optional(),
});
export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

export const NotificationPreferencesDtoSchema = z.object({
  organizationId: z.string(),
  userId: z.string().nullable().optional(),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  categoryPreferences: z.record(NotificationCategorySchema, z.boolean()),
  minEmailSeverity: NotificationSeveritySchema,
  updatedAt: z.string(),
});
export type NotificationPreferencesDto = z.infer<typeof NotificationPreferencesDtoSchema>;

export const UpdateNotificationPreferencesRequestSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  categoryPreferences: z.record(NotificationCategorySchema, z.boolean()).optional(),
  minEmailSeverity: NotificationSeveritySchema.optional(),
});
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof UpdateNotificationPreferencesRequestSchema
>;

export const CreateNotificationRequestSchema = z.object({
  organizationId: z.string(),
  userId: z.string().optional(),
  category: NotificationCategorySchema,
  severity: NotificationSeveritySchema,
  title: z.string().min(1),
  message: z.string().min(1),
  channels: z.array(NotificationChannelSchema).optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actionUrl: z.string().optional(),
  incidentKey: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateNotificationRequest = z.infer<typeof CreateNotificationRequestSchema>;

export const NotificationFilterSchema = z.object({
  status: NotificationStatusSchema.optional(),
  category: NotificationCategorySchema.optional(),
  severity: NotificationSeveritySchema.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(250).optional().default(20),
});
export type NotificationFilter = z.infer<typeof NotificationFilterSchema>;

export const UnreadCountResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
});
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;
