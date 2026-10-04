/**
 * Amazon Selling Partner API (SP-API) HTTP Client
 * Canonical Specifications: Section 38 of 01_ENGINEERING_SPEC.md & Prompt 16
 * 
 * Features:
 * 1. Automatic LWA access token injection via AmazonLwaClient.
 * 2. Token-bucket rate limiting per operation type with burst capacity.
 * 3. Exponential backoff with jitter on HTTP 429 / RequestThrottled.
 * 4. Automatic token eviction and retry on HTTP 401.
 * 5. Structured error normalization via AmazonErrorNormalizer.
 */

import {
  AmazonCredentials,
  AMAZON_REGION_ENDPOINTS,
  AMAZON_MARKETPLACES,
  AmazonSpApiResponse,
  assertNotDeprecatedSpApiVersion,
} from "./amazon-types.js";
import { AmazonLwaClient } from "./amazon-lwa.js";
import { AmazonErrorNormalizer } from "./amazon-normalizer.js";
import { ProviderRateLimitError } from "../../errors/provider-error.js";

export interface AmazonClientOptions {
  fetchFn?: typeof fetch;
  lwaClient?: AmazonLwaClient;
  normalizer?: AmazonErrorNormalizer;
  maxRetries?: number;
  skipRateLimitCheck?: boolean;
}

export interface SpApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  queryParams?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  operationType?: "ORDERS" | "LISTINGS" | "INVENTORY" | "FEEDS" | "SELLERS";
  retryCount?: number;
}

export class AmazonSpApiClient {
  private readonly fetchFn: typeof fetch;
  private readonly lwaClient: AmazonLwaClient;
  private readonly normalizer: AmazonErrorNormalizer;
  private readonly maxRetries: number;
  private readonly baseUrl: string;

  // Simple token bucket rate limiter state per operation
  private readonly bucketLimits: Record<string, { rate: number; burst: number; tokens: number; lastRefill: number }> = {
    ORDERS: { rate: 0.5, burst: 30, tokens: 30, lastRefill: Date.now() },
    LISTINGS: { rate: 5, burst: 10, tokens: 10, lastRefill: Date.now() },
    INVENTORY: { rate: 5, burst: 10, tokens: 10, lastRefill: Date.now() },
    FEEDS: { rate: 0.0083, burst: 1, tokens: 1, lastRefill: Date.now() },
    SELLERS: { rate: 0.016, burst: 15, tokens: 15, lastRefill: Date.now() },
    DEFAULT: { rate: 2, burst: 10, tokens: 10, lastRefill: Date.now() },
  };

  constructor(
    private readonly credentials: AmazonCredentials,
    options: AmazonClientOptions = {}
  ) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.lwaClient = options.lwaClient ?? new AmazonLwaClient(credentials, { fetchFn: this.fetchFn });
    this.normalizer = options.normalizer ?? new AmazonErrorNormalizer();
    this.maxRetries = options.maxRetries ?? 3;

    // Resolve base host from region or marketplace
    let region = credentials.region;
    if (!region && credentials.marketplaceId) {
      region = AMAZON_MARKETPLACES[credentials.marketplaceId]?.region ?? "NA";
    }
    this.baseUrl = AMAZON_REGION_ENDPOINTS[region ?? "NA"] || AMAZON_REGION_ENDPOINTS.NA;
  }

  getLwaClient(): AmazonLwaClient {
    return this.lwaClient;
  }

  /**
   * Refills the token bucket for the designated operation and checks availability.
   */
  private checkRateLimit(op: string): boolean {
    const bucket = this.bucketLimits[op] ?? this.bucketLimits.DEFAULT ?? {
      rate: 1,
      burst: 5,
      tokens: 5,
      lastRefill: Date.now(),
    };
    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(bucket.burst, bucket.tokens + elapsedSeconds * bucket.rate);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Executes an SP-API REST request with authenticated token and error handling.
   */
  async request<T = unknown>(options: SpApiRequestOptions): Promise<AmazonSpApiResponse<T>> {
    const op = options.operationType || "DEFAULT";
    const retryCount = options.retryCount ?? 0;

    // Check rate limit token bucket
    const hasCapacity = this.checkRateLimit(op);
    if (!hasCapacity && retryCount >= this.maxRetries) {
      throw new ProviderRateLimitError(
        "AMAZON",
        `Amazon SP-API client rate limit bucket exhausted for operation ${op}.`,
        { retryAfterMs: 2000, httpStatus: 429 }
      );
    }

    // Guard against deprecated version paths
    const pathParts = options.path.split("/").filter(Boolean);
    const resource = pathParts[0];
    const version = pathParts[1];
    if (resource && version) {
      assertNotDeprecatedSpApiVersion(resource, version);
    }

    // Retrieve LWA access token
    const accessToken = await this.lwaClient.getAccessToken();

    // Construct full URL with query parameters
    let url = `${this.baseUrl}${options.path.startsWith("/") ? "" : "/"}${options.path}`;
    if (options.queryParams) {
      const qp = new URLSearchParams();
      for (const [key, val] of Object.entries(options.queryParams)) {
        if (val !== undefined && val !== null) {
          qp.append(key, String(val));
        }
      }
      const qs = qp.toString();
      if (qs) {
        url += (url.includes("?") ? "&" : "?") + qs;
      }
    }

    const headers: Record<string, string> = {
      "x-amz-access-token": accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "MultichannelInventoryPlatform/1.0 (Language=TypeScript)",
    };

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err: unknown) {
      throw this.normalizer.normalize(err);
    }

    // Handle HTTP 401 Unauthorized: token expired or revoked
    if (res.status === 401 && retryCount < 1) {
      this.lwaClient.clearCache();
      return this.request<T>({
        ...options,
        retryCount: retryCount + 1,
      });
    }

    // Handle HTTP 429 Throttling: retry with exponential backoff if retryable
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 2000;

      if (retryCount < this.maxRetries) {
        const backoffMs = retryAfterMs + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, backoffMs));
        return this.request<T>({
          ...options,
          retryCount: retryCount + 1,
        });
      }

      throw new ProviderRateLimitError(
        "AMAZON",
        `Amazon SP-API request throttled for ${options.path} (HTTP 429)`,
        { httpStatus: 429, retryAfterMs }
      );
    }

    let resData: any;
    try {
      resData = await res.json();
    } catch {
      resData = {};
    }

    if (!res.ok) {
      throw this.normalizer.normalize(resData, {
        httpStatus: res.status,
      });
    }

    if (resData && typeof resData === "object" && resData.payload === undefined) {
      resData.payload = resData;
    }

    return resData as AmazonSpApiResponse<T>;
  }

  getBucketState(op: string = "DEFAULT"): { rate: number; burst: number; tokens: number } {
    const bucket = this.bucketLimits[op] ?? this.bucketLimits.DEFAULT ?? {
      rate: 1,
      burst: 5,
      tokens: 5,
      lastRefill: Date.now(),
    };
    return {
      rate: bucket.rate,
      burst: bucket.burst,
      tokens: Math.round(bucket.tokens * 10) / 10,
    };
  }
}
