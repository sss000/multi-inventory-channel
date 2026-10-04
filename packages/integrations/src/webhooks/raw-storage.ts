/**
 * Raw Webhook Secure Storage Service
 * Specifications: Prompt 18 & Section 43 of 01_ENGINEERING_SPEC.md
 * 
 * Features:
 * - Tenant-aware private bucket pathing: ${organizationId}/webhooks/${year}/${month}/${eventId}.json
 * - Access controls: Strictly verifies organization tenant boundary
 * - Size limits: Enforces max payload size (default: 5MB)
 * - Retention limits: Tracks retention expiration (default: 30 days) and automated pruning
 * - Redaction: Strips sensitive fields (CVV, PAN, tokens, passwords) before persisting
 */

import {
  RawWebhookStorageRecord,
  RawWebhookStorageOptions,
} from "@platform/contracts";
import { redactRawPayloadString } from "@platform/security";

export class PayloadTooLargeError extends Error {
  readonly httpStatus = 413;
  readonly size: number;
  readonly limit: number;

  constructor(size: number, limit: number) {
    super(`Payload size ${size} bytes exceeds maximum allowed limit of ${limit} bytes`);
    this.name = "PayloadTooLargeError";
    this.size = size;
    this.limit = limit;
  }
}

export class UnauthorizedStorageAccessError extends Error {
  readonly httpStatus = 403;

  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedStorageAccessError";
  }
}

/**
 * Storage Driver Interface for server-side persistence (Supabase Storage / In-Memory)
 */
export interface StorageDriver {
  upload(
    bucket: string,
    path: string,
    content: string | Buffer,
    contentType: string
  ): Promise<void>;
  download(bucket: string, path: string): Promise<string>;
  delete(bucket: string, path: string): Promise<void>;
  list(
    bucket: string,
    prefix?: string
  ): Promise<Array<{ path: string; size: number; updatedAt: Date }>>;
}

/**
 * In-Memory driver for testing and hermetic execution
 */
export class InMemoryStorageDriver implements StorageDriver {
  private readonly files = new Map<
    string,
    { content: string; contentType: string; size: number; updatedAt: Date }
  >();

  private key(bucket: string, path: string): string {
    return `${bucket}:::${path}`;
  }

  async upload(
    bucket: string,
    path: string,
    content: string | Buffer,
    contentType: string
  ): Promise<void> {
    const str = Buffer.isBuffer(content) ? content.toString("utf8") : content;
    this.files.set(this.key(bucket, path), {
      content: str,
      contentType,
      size: Buffer.byteLength(str, "utf8"),
      updatedAt: new Date(),
    });
  }

  async download(bucket: string, path: string): Promise<string> {
    const file = this.files.get(this.key(bucket, path));
    if (!file) {
      throw new Error(`File not found: ${bucket}/${path}`);
    }
    return file.content;
  }

  async delete(bucket: string, path: string): Promise<void> {
    this.files.delete(this.key(bucket, path));
  }

  async list(
    bucket: string,
    prefix = ""
  ): Promise<Array<{ path: string; size: number; updatedAt: Date }>> {
    const results: Array<{ path: string; size: number; updatedAt: Date }> = [];
    const bucketPrefix = `${bucket}:::${prefix}`;
    for (const [k, v] of this.files.entries()) {
      if (k.startsWith(bucketPrefix)) {
        const path = k.split(":::")[1]!;
        results.push({ path, size: v.size, updatedAt: v.updatedAt });
      }
    }
    return results;
  }

  clear(): void {
    this.files.clear();
  }
}

/**
 * Supabase Storage Driver implementation
 */
export class SupabaseStorageDriver implements StorageDriver {
  private readonly storageUrl: string;
  private readonly serviceRoleKey: string;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.storageUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1`;
    this.serviceRoleKey = serviceRoleKey;
  }

  async upload(
    bucket: string,
    path: string,
    content: string | Buffer,
    contentType: string
  ): Promise<void> {
    const url = `${this.storageUrl}/object/${bucket}/${encodeURIComponent(path)}`;
    const body = typeof content === "string" ? content : new Uint8Array(content);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Supabase storage upload failed with status ${res.status}`);
    }
  }

  async download(bucket: string, path: string): Promise<string> {
    const url = `${this.storageUrl}/object/authenticated/${bucket}/${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Supabase storage download failed with status ${res.status}`);
    }
    return res.text();
  }

  async delete(bucket: string, path: string): Promise<void> {
    const url = `${this.storageUrl}/object/${bucket}/${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Supabase storage delete failed with status ${res.status}`);
    }
  }

  async list(
    bucket: string,
    prefix = ""
  ): Promise<Array<{ path: string; size: number; updatedAt: Date }>> {
    const url = `${this.storageUrl}/object/list/${bucket}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ name: string; metadata?: { size?: number }; updated_at?: string }>;
    return data.map((item) => ({
      path: prefix ? `${prefix}/${item.name}` : item.name,
      size: item.metadata?.size ?? 0,
      updatedAt: item.updated_at ? new Date(item.updated_at) : new Date(),
    }));
  }
}

/**
 * Service orchestrating secure storage of raw webhook payloads
 */
export class RawWebhookStorageService {
  private readonly driver: StorageDriver;
  private readonly bucket: string;
  private readonly maxSizeBytes: number;
  private readonly retentionDays: number;
  private readonly enableRedaction: boolean;
  private readonly records = new Map<string, RawWebhookStorageRecord>();

  constructor(
    driver?: StorageDriver,
    options: RawWebhookStorageOptions = {}
  ) {
    this.driver = driver ?? new InMemoryStorageDriver();
    this.bucket = options.bucket ?? "webhooks-raw";
    this.maxSizeBytes = options.maxSizeBytes ?? 5 * 1024 * 1024; // 5MB
    this.retentionDays = options.retentionDays ?? 30; // 30 days
    this.enableRedaction = options.enableRedaction ?? true;
  }

  /**
   * Persists a raw webhook payload securely with tenant partitioning, size check, and PII redaction.
   */
  async savePayload(params: {
    organizationId: string;
    provider: string;
    accountId: string;
    eventId: string;
    providerEventId: string;
    rawBody: string | Buffer;
    headers?: Record<string, string | string[] | undefined>;
    contentType?: string;
  }): Promise<RawWebhookStorageRecord> {
    const {
      organizationId,
      provider,
      accountId,
      eventId,
      providerEventId,
      rawBody,
      headers = {},
      contentType = "application/json",
    } = params;

    if (!organizationId) {
      throw new UnauthorizedStorageAccessError("organizationId is mandatory for raw webhook storage");
    }

    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
    const sizeBytes = Buffer.byteLength(bodyStr, "utf8");

    // Size limit check
    if (sizeBytes > this.maxSizeBytes) {
      throw new PayloadTooLargeError(sizeBytes, this.maxSizeBytes);
    }

    // Redaction / Data Minimization
    const sanitizedBody = this.enableRedaction
      ? redactRawPayloadString(bodyStr)
      : bodyStr;

    // Partition path: ${organizationId}/webhooks/${year}/${month}/${eventId}.json
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const storagePath = `${organizationId}/webhooks/${year}/${month}/${eventId}.json`;

    // Persist to storage driver
    await this.driver.upload(this.bucket, storagePath, sanitizedBody, contentType);

    // Flatten headers for metadata record
    const flatHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined) {
        flatHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
      }
    }

    const expiresAt = new Date(now.getTime() + this.retentionDays * 86400 * 1000);

    const record: RawWebhookStorageRecord = {
      id: eventId,
      organizationId,
      provider,
      providerAccountId: accountId,
      providerEventId,
      storagePath,
      bucket: this.bucket,
      payloadSize: sizeBytes,
      contentType,
      headers: flatHeaders,
      createdAt: now,
      expiresAt,
      isRedacted: this.enableRedaction,
      retentionDays: this.retentionDays,
    };

    this.records.set(record.id, record);
    return record;
  }

  /**
   * Retrieves a stored raw payload, strictly verifying tenant access controls.
   */
  async getPayload(organizationId: string, storagePath: string): Promise<string> {
    if (!organizationId) {
      throw new UnauthorizedStorageAccessError("Missing organizationId for access");
    }

    // Access control: Ensure storagePath belongs to this organization
    const expectedPrefix = `${organizationId}/webhooks/`;
    if (!storagePath.startsWith(expectedPrefix)) {
      throw new UnauthorizedStorageAccessError(
        `Cross-tenant access forbidden. Path '${storagePath}' does not belong to organization '${organizationId}'`
      );
    }

    return this.driver.download(this.bucket, storagePath);
  }

  /**
   * Fetches the metadata record for an event.
   */
  getRecord(eventId: string): RawWebhookStorageRecord | undefined {
    return this.records.get(eventId);
  }

  /**
   * Cleans up expired webhook payloads based on retention limits.
   */
  async cleanupExpiredWebhooks(): Promise<{ deletedCount: number }> {
    const now = new Date();
    let deletedCount = 0;

    for (const [id, record] of Array.from(this.records.entries())) {
      if (record.expiresAt <= now) {
        try {
          await this.driver.delete(record.bucket, record.storagePath);
          this.records.delete(id);
          deletedCount++;
        } catch {
          // Continue cleanup
        }
      }
    }

    return { deletedCount };
  }

  getDriver(): StorageDriver {
    return this.driver;
  }
}
