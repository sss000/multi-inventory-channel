import { z } from "zod";

export const OrganizationDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;

export const UpdateOrganizationRequestSchema = z.object({
  name: z.string().min(1).optional(),
});
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequestSchema>;

export const OrganizationMemberDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  createdAt: z.string(),
});
export type OrganizationMemberDto = z.infer<typeof OrganizationMemberDtoSchema>;

export const AddMemberRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "OPERATOR", "VIEWER", "Owner", "Admin", "InventoryManager", "Viewer"]),
});
export type AddMemberRequest = z.infer<typeof AddMemberRequestSchema>;

export const UpdateMemberRequestSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "OPERATOR", "VIEWER", "Owner", "Admin", "InventoryManager", "Viewer"]),
});
export type UpdateMemberRequest = z.infer<typeof UpdateMemberRequestSchema>;
