/**
 * Organization and Membership Domain Service
 * Canonical Specification: Section 47 of 01_ENGINEERING_SPEC.md & Prompt 06
 * Enforces server-side tenant derivation, organization management, and membership RBAC.
 */

import { randomUUID } from "node:crypto";
import {
  OrganizationDto,
  UpdateOrganizationRequest,
  OrganizationMemberDto,
  AddMemberRequest,
} from "@platform/contracts";
import { TenantContext } from "./tenant.js";
import { SystemRole, assertPermission, normalizeRole } from "./permissions.js";
import { validateTenantAccess } from "./tenant-isolation.js";

export class MemberNotFoundError extends Error {
  constructor(memberId: string) {
    super(`Membership '${memberId}' not found in current organization.`);
    this.name = "MemberNotFoundError";
  }
}

export class OrganizationService {
  private readonly orgs = new Map<string, OrganizationDto>();
  private readonly members = new Map<string, OrganizationMemberDto>();

  constructor() {
    // Seed default baseline demo organization
    const demoOrgId = "00000000-0000-0000-0000-000000000001";
    this.orgs.set(demoOrgId, {
      id: demoOrgId,
      name: "Acme Ecommerce Corp",
      slug: "acme-ecommerce",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const demoMemberId = "m0000000-0000-0000-0000-000000000001";
    this.members.set(demoMemberId, {
      id: demoMemberId,
      organizationId: demoOrgId,
      userId: "u0000000-0000-0000-0000-000000000001",
      email: "demo-merchant@example.com",
      name: "Demo Merchant",
      role: "OWNER",
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Registers a new organization and owner membership.
   */
  createOrganization(id: string, name: string, slug: string): OrganizationDto {
    const org: OrganizationDto = {
      id,
      name,
      slug,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.orgs.set(id, org);
    return org;
  }

  /**
   * Returns current organization for the active authenticated session.
   */
  async getCurrentOrganization(context: TenantContext): Promise<OrganizationDto> {
    const orgId = context.organizationId as unknown as string;
    let org = this.orgs.get(orgId);

    if (!org) {
      // Auto-provision tenant entry if authenticated by auth provider
      org = {
        id: orgId,
        name: "Merchant Organization",
        slug: `org-${orgId.slice(0, 8)}`,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.orgs.set(orgId, org);
    }

    return org;
  }

  /**
   * Updates current organization. Requires organization:manage permission.
   */
  async updateCurrentOrganization(
    context: TenantContext,
    input: UpdateOrganizationRequest
  ): Promise<OrganizationDto> {
    assertPermission(context.role, "organization:manage");
    const org = await this.getCurrentOrganization(context);

    if (input.name) {
      org.name = input.name;
    }
    org.updatedAt = new Date().toISOString();
    this.orgs.set(org.id, org);

    return org;
  }

  /**
   * Lists all members in the current organization.
   */
  async listMembers(context: TenantContext): Promise<OrganizationMemberDto[]> {
    const orgId = context.organizationId as unknown as string;
    const results: OrganizationMemberDto[] = [];

    for (const member of this.members.values()) {
      if (member.organizationId === orgId) {
        results.push(member);
      }
    }

    return results;
  }

  /**
   * Adds a new member to the current organization. Requires users:manage permission.
   */
  async addMember(
    context: TenantContext,
    input: AddMemberRequest
  ): Promise<OrganizationMemberDto> {
    assertPermission(context.role, "users:manage");
    const orgId = context.organizationId as unknown as string;

    const newMember: OrganizationMemberDto = {
      id: randomUUID(),
      organizationId: orgId,
      userId: randomUUID(),
      email: input.email,
      name: input.name,
      role: normalizeRole(input.role),
      createdAt: new Date().toISOString(),
    };

    this.members.set(newMember.id, newMember);
    return newMember;
  }

  /**
   * Updates an existing member's role. Requires users:manage permission.
   */
  async updateMemberRole(
    context: TenantContext,
    memberId: string,
    role: SystemRole
  ): Promise<OrganizationMemberDto> {
    assertPermission(context.role, "users:manage");
    const member = this.members.get(memberId);

    if (!member) {
      throw new MemberNotFoundError(memberId);
    }

    // Ensure member belongs strictly to current organization
    validateTenantAccess(context, member.organizationId);

    member.role = normalizeRole(role);
    this.members.set(memberId, member);
    return member;
  }

  /**
   * Removes a member from the current organization. Requires users:manage permission.
   */
  async removeMember(context: TenantContext, memberId: string): Promise<boolean> {
    assertPermission(context.role, "users:manage");
    const member = this.members.get(memberId);

    if (!member) {
      throw new MemberNotFoundError(memberId);
    }

    // Ensure member belongs strictly to current organization
    validateTenantAccess(context, member.organizationId);

    return this.members.delete(memberId);
  }
}

export const defaultOrganizationService = new OrganizationService();
