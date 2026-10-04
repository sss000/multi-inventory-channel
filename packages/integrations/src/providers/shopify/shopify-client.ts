/**
 * Shopify Admin GraphQL API Client
 * Canonical Specifications: Section 36 of 01_ENGINEERING_SPEC.md & Prompt 14
 * 
 * Rules:
 * 1. Executes GraphQL queries and mutations against configured API version.
 * 2. Implements leaky-bucket rate limiting based on GraphQL extensions.cost.throttleStatus.
 * 3. Automatically retries throttled requests (HTTP 429, GraphQL THROTTLED) with jitter.
 * 4. Normalizes errors through ShopifyErrorNormalizer.
 */

import {
  ShopifyCredentials,
  ShopifyGraphQLResponse,
  SHOPIFY_DEFAULT_API_VERSION,
} from "./shopify-types.js";
import { ShopifyErrorNormalizer } from "./shopify-normalizer.js";
import { sanitizeShopDomain } from "./shopify-oauth.js";
import { assertValidShopifyApiVersion } from "./shopify-version.js";
import { ProviderAuthenticationError, ProviderRateLimitError } from "../../errors/provider-error.js";

export interface GraphQLRequestOptions {
  query: string;
  variables?: Record<string, unknown>;
  maxRetries?: number;
  skipRateLimitCheck?: boolean;
}

export interface LeakyBucketState {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number; // points restored per second (standard: 50)
  lastUpdated: number;
}

export class ShopifyGraphQLClient {
  readonly normalizer: ShopifyErrorNormalizer;
  private readonly credentials: ShopifyCredentials;
  private readonly shopDomain: string;
  private readonly apiVersion: string;
  private readonly fetchFn: typeof fetch;

  // Leaky Bucket State
  private bucket: LeakyBucketState = {
    maximumAvailable: 1000,
    currentlyAvailable: 1000,
    restoreRate: 50,
    lastUpdated: Date.now(),
  };

  constructor(
    credentials: ShopifyCredentials,
    options: {
      fetchFn?: typeof fetch;
      normalizer?: ShopifyErrorNormalizer;
    } = {}
  ) {
    this.shopDomain = sanitizeShopDomain(credentials.shopDomain);
    this.apiVersion = assertValidShopifyApiVersion(credentials.apiVersion || SHOPIFY_DEFAULT_API_VERSION);
    this.credentials = {
      ...credentials,
      shopDomain: this.shopDomain,
      apiVersion: this.apiVersion,
    };
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.normalizer = options.normalizer || new ShopifyErrorNormalizer();
  }

  getBucketState(): Readonly<LeakyBucketState> {
    this.refreshBucket();
    return { ...this.bucket };
  }

  /**
   * Refreshes the currently available points based on elapsed time and restore rate.
   */
  private refreshBucket(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.bucket.lastUpdated) / 1000;
    const restoredPoints = elapsedSeconds * this.bucket.restoreRate;

    this.bucket.currentlyAvailable = Math.min(
      this.bucket.maximumAvailable,
      this.bucket.currentlyAvailable + restoredPoints
    );
    this.bucket.lastUpdated = now;
  }

  /**
   * Updates bucket state from Shopify's GraphQL cost extension response.
   */
  private updateBucketFromResponse(res: ShopifyGraphQLResponse): void {
    const throttle = res.extensions?.cost?.throttleStatus;
    if (throttle) {
      this.bucket.maximumAvailable = throttle.maximumAvailable;
      this.bucket.currentlyAvailable = throttle.currentlyAvailable;
      this.bucket.restoreRate = throttle.restoreRate;
      this.bucket.lastUpdated = Date.now();
    }
  }

  /**
   * Executes a GraphQL query/mutation with automated leaky-bucket management and retry backoff.
   */
  async request<T>(options: GraphQLRequestOptions): Promise<ShopifyGraphQLResponse<T>> {
    if (!this.credentials.accessToken) {
      throw new ProviderAuthenticationError(
        "SHOPIFY",
        "Shopify access token is required to execute GraphQL Admin API requests"
      );
    }

    const maxRetries = options.maxRetries ?? 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      // 1. Check local leaky bucket
      this.refreshBucket();
      if (!options.skipRateLimitCheck && this.bucket.currentlyAvailable < 50) {
        const waitMs = Math.ceil(((50 - this.bucket.currentlyAvailable) / this.bucket.restoreRate) * 1000);
        await new Promise((r) => setTimeout(r, waitMs));
        this.refreshBucket();
      }

      const endpoint = `https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`;
      const body = JSON.stringify({
        query: options.query,
        variables: options.variables,
      });

      let response: Response;
      try {
        response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": this.credentials.accessToken,
          },
          body,
        });
      } catch (err: unknown) {
        if (attempt < maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 200 + jitter));
          continue;
        }
        throw this.normalizer.normalize(err);
      }

      // Check HTTP 429
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : 2000;
        if (attempt < maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          await new Promise((r) => setTimeout(r, retryAfterMs + jitter));
          continue;
        }
        throw new ProviderRateLimitError("SHOPIFY", "Shopify GraphQL request throttled (HTTP 429)", {
          httpStatus: 429,
          retryAfterMs,
        });
      }

      if (!response.ok && response.status !== 200) {
        const errorText = await response.text();
        throw this.normalizer.normalize(
          { message: `Shopify HTTP ${response.status}: ${errorText}`, status: response.status },
          { httpStatus: response.status }
        );
      }

      let jsonResponse: ShopifyGraphQLResponse<T>;
      try {
        jsonResponse = (await response.json()) as ShopifyGraphQLResponse<T>;
      } catch (err: unknown) {
        throw this.normalizer.normalize(err, { httpStatus: response.status });
      }

      // Update leaky bucket telemetry from extensions
      this.updateBucketFromResponse(jsonResponse);

      // Check if GraphQL returned THROTTLED error
      if (Array.isArray(jsonResponse.errors)) {
        const isThrottled = jsonResponse.errors.some(
          (e) => e.extensions?.code === "THROTTLED" || e.message?.toLowerCase().includes("throttled")
        );
        if (isThrottled && attempt < maxRetries) {
          attempt++;
          const waitMs = Math.max(1000, (100 / this.bucket.restoreRate) * 1000) + Math.random() * 200;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        // If other GraphQL errors present (e.g. unauthorized, not found, or final throttled)
        throw this.normalizer.normalize(jsonResponse);
      }

      return jsonResponse;
    }

    throw new ProviderRateLimitError(
      "SHOPIFY",
      "Max retry attempts exhausted for throttled Shopify GraphQL operation"
    );
  }
}
