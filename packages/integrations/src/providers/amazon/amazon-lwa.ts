/**
 * Login with Amazon (LWA) OAuth Token Manager
 * Canonical Specification: Section 38 of 01_ENGINEERING_SPEC.md & Prompt 16
 * 
 * Handles seller authorization, LWA refresh token rotation, and in-memory access token caching.
 */

import {
  AmazonCredentials,
  AmazonLwaTokenResponse,
  AMAZON_LWA_TOKEN_ENDPOINT,
} from "./amazon-types.js";
import {
  ProviderAuthenticationError,
  ProviderTransientError,
} from "../../errors/provider-error.js";

export interface LwaClientOptions {
  fetchFn?: typeof fetch;
  tokenEndpoint?: string;
  cacheTtlBufferMs?: number; // Time before expiry to trigger refresh (default 5 min = 300,000 ms)
}

export class AmazonLwaClient {
  private readonly fetchFn: typeof fetch;
  private readonly tokenEndpoint: string;
  private readonly cacheTtlBufferMs: number;

  private cachedAccessToken?: string;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly credentials: AmazonCredentials,
    options: LwaClientOptions = {}
  ) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.tokenEndpoint = options.tokenEndpoint ?? AMAZON_LWA_TOKEN_ENDPOINT;
    this.cacheTtlBufferMs = options.cacheTtlBufferMs ?? 5 * 60 * 1000;
  }

  /**
   * Retrieves a valid access token, utilizing cached token or fetching a refreshed token.
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.tokenExpiresAt > now + this.cacheTtlBufferMs) {
      return this.cachedAccessToken;
    }

    return this.refreshAccessToken();
  }

  /**
   * Forces a refresh of the LWA access token using the stored refresh token.
   */
  async refreshAccessToken(): Promise<string> {
    const clientId = this.credentials.clientId;
    const clientSecret = this.credentials.clientSecret;
    const refreshToken = this.credentials.refreshToken;

    if (!refreshToken) {
      throw new ProviderAuthenticationError(
        "AMAZON",
        "Amazon SP-API refresh token is missing. Seller re-authorization required."
      );
    }

    if (!clientId || !clientSecret) {
      throw new ProviderAuthenticationError(
        "AMAZON",
        "Amazon SP-API LWA client credentials (clientId/clientSecret) are not configured."
      );
    }

    const bodyParams = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    let res: Response;
    try {
      res = await this.fetchFn(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: bodyParams.toString(),
      });
    } catch (err: unknown) {
      throw new ProviderTransientError(
        "AMAZON",
        `Network error during Amazon LWA token refresh: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = { error: res.statusText };
      }

      const errorMsg = errBody?.error_description || errBody?.error || `HTTP ${res.status} LWA token error`;
      if (res.status === 400 || res.status === 401) {
        throw new ProviderAuthenticationError(
          "AMAZON",
          `Amazon LWA seller authorization revoked or invalid: ${errorMsg}`,
          { httpStatus: res.status, details: errBody }
        );
      }

      throw new ProviderTransientError(
        "AMAZON",
        `Transient error from Amazon LWA token service (${res.status}): ${errorMsg}`,
        { httpStatus: res.status }
      );
    }

    const data = (await res.json()) as AmazonLwaTokenResponse;
    if (!data.access_token) {
      throw new ProviderAuthenticationError(
        "AMAZON",
        "Invalid LWA response: access_token field missing in response payload"
      );
    }

    this.cachedAccessToken = data.access_token;
    // expires_in is in seconds, convert to epoch ms
    const expiresInMs = (data.expires_in ?? 3600) * 1000;
    this.tokenExpiresAt = Date.now() + expiresInMs;

    return this.cachedAccessToken;
  }

  /**
   * Clears the in-memory cached token (e.g. on 401 Unauthorized from SP-API).
   */
  clearCache(): void {
    this.cachedAccessToken = undefined;
    this.tokenExpiresAt = 0;
  }

  /**
   * Alias for clearCache() for lifecycle management.
   */
  invalidateToken(): void {
    this.clearCache();
  }

  isTokenCachedAndValid(): boolean {
    return Boolean(this.cachedAccessToken && this.tokenExpiresAt > Date.now() + this.cacheTtlBufferMs);
  }

  /**
   * Exchanges an authorization code for LWA access and refresh tokens.
   */
  async exchangeAuthorizationCode(
    code: string,
    redirectUri?: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    const clientId = this.credentials.clientId;
    const clientSecret = this.credentials.clientSecret;
    if (!clientId || !clientSecret) {
      throw new ProviderAuthenticationError(
        "AMAZON",
        "Amazon SP-API LWA client credentials (clientId/clientSecret) are not configured."
      );
    }

    const bodyParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
    });
    if (redirectUri) {
      bodyParams.append("redirect_uri", redirectUri);
    }

    const res = await this.fetchFn(this.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = {};
      }
      throw new ProviderAuthenticationError(
        "AMAZON",
        `Amazon authorization code exchange failed (${res.status}): ${errBody?.error_description || errBody?.error || res.statusText}`,
        { httpStatus: res.status, details: errBody }
      );
    }

    const data = (await res.json()) as AmazonLwaTokenResponse;
    this.cachedAccessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 3600,
    };
  }
}
