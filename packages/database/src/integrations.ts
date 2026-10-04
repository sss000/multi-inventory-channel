/**
 * Integrations / Channels Database Repository & Service
 * Canonical Specification: Section 51 of 01_ENGINEERING_SPEC.md & Prompt 24
 *
 * Rules:
 * 1. Multi-tenant isolation: All operations enforce organization_id context.
 * 2. Status management: ACTIVE, DISCONNECTED, ERROR, PAUSED.
 * 3. Standard DTO conversions and pagination.
 */

import { ChannelAccountRow, ChannelAccountStatus } from "./schema/types.js";
import {
  IntegrationDto,
  ConnectIntegrationRequest,
  IntegrationHealthDto,
} from "@platform/contracts";
import {
  TenantContext,
  assertPermission,
} from "@platform/security";
import {
  IntegrationNotFoundError,
  TenantAccessDeniedError,
} from "@platform/domain";

export interface IntegrationListFilter {
  provider?: string;
  status?: ChannelAccountStatus;
  limit?: number;
  offset?: number;
}

export interface IntegrationRepository {
  createAccount(account: ChannelAccountRow): Promise<void>;
  findAccountById(organizationId: string, id: string): Promise<ChannelAccountRow | null>;
  listAccounts(
    organizationId: string,
    filter?: IntegrationListFilter
  ): Promise<{ items: ChannelAccountRow[]; total: number }>;
  updateAccount(account: ChannelAccountRow): Promise<void>;
  deleteAccount(organizationId: string, id: string): Promise<void>;
}

export function toIntegrationDto(row: ChannelAccountRow): IntegrationDto {
  const provider = (row.metadata?.provider as string) || "MOCK";
  return {
    id: row.id,
    organizationId: row.organization_id,
    channelId: row.channel_id,
    provider,
    displayName: row.display_name,
    status: row.status,
    externalAccountId: row.external_account_id,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class InMemoryIntegrationRepository implements IntegrationRepository {
  private accounts = new Map<string, ChannelAccountRow>();

  async createAccount(account: ChannelAccountRow): Promise<void> {
    this.accounts.set(account.id, { ...account });
  }

  async findAccountById(organizationId: string, id: string): Promise<ChannelAccountRow | null> {
    const account = this.accounts.get(id);
    if (!account || account.organization_id !== organizationId) {
      return null;
    }
    return { ...account };
  }

  async listAccounts(
    organizationId: string,
    filter: IntegrationListFilter = {}
  ): Promise<{ items: ChannelAccountRow[]; total: number }> {
    let items = Array.from(this.accounts.values()).filter(
      (a) => a.organization_id === organizationId
    );

    if (filter.status) {
      items = items.filter((a) => a.status === filter.status);
    }
    if (filter.provider) {
      items = items.filter(
        (a) => (a.metadata?.provider as string)?.toUpperCase() === filter.provider?.toUpperCase()
      );
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = items.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    const paged = items.slice(offset, offset + limit);

    return {
      items: paged.map((a) => ({ ...a })),
      total,
    };
  }

  async updateAccount(account: ChannelAccountRow): Promise<void> {
    this.accounts.set(account.id, { ...account });
  }

  async deleteAccount(organizationId: string, id: string): Promise<void> {
    const account = await this.findAccountById(organizationId, id);
    if (account) {
      this.accounts.delete(id);
    }
  }

  clear(): void {
    this.accounts.clear();
  }
}

export class IntegrationDatabaseService {
  constructor(private readonly repository: IntegrationRepository) {}

  async listIntegrations(
    context: TenantContext,
    filter: IntegrationListFilter = {}
  ): Promise<{ items: IntegrationDto[]; total: number }> {
    assertPermission(context.role, "integrations:read");
    const result = await this.repository.listAccounts(context.organizationId, filter);
    return {
      items: result.items.map(toIntegrationDto),
      total: result.total,
    };
  }

  async getIntegration(context: TenantContext, integrationId: string): Promise<IntegrationDto> {
    assertPermission(context.role, "integrations:read");
    const row = await this.repository.findAccountById(context.organizationId, integrationId);
    if (!row) {
      throw new IntegrationNotFoundError(integrationId);
    }
    return toIntegrationDto(row);
  }

  async connectIntegration(
    context: TenantContext,
    data: ConnectIntegrationRequest
  ): Promise<IntegrationDto> {
    assertPermission(context.role, "integrations:write");
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const row: ChannelAccountRow = {
      id,
      organization_id: context.organizationId,
      channel_id: crypto.randomUUID(),
      display_name: data.displayName,
      status: "ACTIVE",
      external_account_id: `ext_${Date.now()}`,
      credential_reference: `vault_${id}`,
      metadata: {
        provider: data.provider,
        settings: data.settings || {},
        connectedBy: context.userId,
      },
      last_successful_sync_at: null,
      last_error_at: null,
      created_at: now,
      updated_at: now,
    };
    await this.repository.createAccount(row);
    return toIntegrationDto(row);
  }

  async disconnectIntegration(context: TenantContext, integrationId: string): Promise<IntegrationDto> {
    assertPermission(context.role, "integrations:write");
    const existing = await this.repository.findAccountById(context.organizationId, integrationId);
    if (!existing) {
      throw new IntegrationNotFoundError(integrationId);
    }
    const updated: ChannelAccountRow = {
      ...existing,
      status: "DISCONNECTED",
      updated_at: new Date().toISOString(),
    };
    await this.repository.updateAccount(updated);
    return toIntegrationDto(updated);
  }

  async reconnectIntegration(context: TenantContext, integrationId: string): Promise<IntegrationDto> {
    assertPermission(context.role, "integrations:write");
    const existing = await this.repository.findAccountById(context.organizationId, integrationId);
    if (!existing) {
      throw new IntegrationNotFoundError(integrationId);
    }
    const updated: ChannelAccountRow = {
      ...existing,
      status: "ACTIVE",
      updated_at: new Date().toISOString(),
    };
    await this.repository.updateAccount(updated);
    return toIntegrationDto(updated);
  }

  async getHealth(context: TenantContext, integrationId: string): Promise<IntegrationHealthDto> {
    assertPermission(context.role, "integrations:read");
    const existing = await this.repository.findAccountById(context.organizationId, integrationId);
    if (!existing) {
      throw new IntegrationNotFoundError(integrationId);
    }
    const provider = (existing.metadata?.provider as string) || "MOCK";
    const healthState = existing.status === "ACTIVE" ? "CONNECTED" : "DISCONNECTED";
    return {
      integrationId,
      provider,
      healthState,
      latencyMs: 42,
      lastCheckedAt: new Date().toISOString(),
      details: {
        lastSync: existing.last_successful_sync_at,
        status: existing.status,
      },
    };
  }
}
