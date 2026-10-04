/**
 * Shopify OAuth Lifecycle & Security Utilities
 * Canonical Specifications: Section 36 of 01_ENGINEERING_SPEC.md & Prompt 14
 */

import crypto from "node:crypto";
import {
  SHOPIFY_REQUIRED_SCOPES,
  ShopifyOAuthInstallParams,
  ShopifyOAuthCallbackParams,
  ShopifyTokenResponse,
} from "./shopify-types.js";
import { ProviderAuthenticationError, ProviderValidationError } from "../../errors/provider-error.js";

/**
 * Normalizes and sanitizes a Shopify shop domain string (e.g., 'example' -> 'example.myshopify.com').
 */
export function sanitizeShopDomain(shopInput: string): string {
  if (!shopInput || typeof shopInput !== "string") {
    throw new ProviderValidationError("SHOPIFY", "Shop domain cannot be empty");
  }
  let clean = shopInput.trim().toLowerCase();
  clean = clean.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!clean.includes(".myshopify.com")) {
    clean = `${clean}.myshopify.com`;
  }
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*.myshopify\.com$/;
  if (!domainRegex.test(clean)) {
    throw new ProviderValidationError("SHOPIFY", `Invalid Shopify shop domain: '${shopInput}'`);
  }
  return clean;
}

/**
 * Builds the official Shopify OAuth authorization URL with CSRF state protection.
 */
export function buildOAuthAuthorizationUrl(params: ShopifyOAuthInstallParams): {
  url: string;
  state: string;
  shop: string;
} {
  const shop = sanitizeShopDomain(params.shop);
  const state = params.state || crypto.randomBytes(16).toString("hex");
  const scopes = (params.scopes || SHOPIFY_REQUIRED_SCOPES).join(",");

  const searchParams = new URLSearchParams({
    client_id: params.clientId,
    scope: scopes,
    redirect_uri: params.redirectUri,
    state,
  });

  const url = `https://${shop}/admin/oauth/authorize?${searchParams.toString()}`;
  return { url, state, shop };
}

/**
 * Verifies the Shopify OAuth callback parameters including timing-safe HMAC signature verification.
 */
export function verifyOAuthCallback(
  params: ShopifyOAuthCallbackParams,
  apiSecret: string,
  expectedState?: string
): { valid: boolean; shop: string; error?: string } {
  if (expectedState && params.state !== expectedState) {
    return {
      valid: false,
      shop: params.shop,
      error: "OAuth state mismatch (potential CSRF attempt)",
    };
  }

  let cleanShop: string;
  try {
    cleanShop = sanitizeShopDomain(params.shop);
  } catch (err: unknown) {
    return {
      valid: false,
      shop: params.shop,
      error: err instanceof Error ? err.message : "Invalid shop domain",
    };
  }

  if (!params.hmac) {
    return {
      valid: false,
      shop: cleanShop,
      error: "Missing HMAC signature in callback",
    };
  }

  // Construct message from sorted keys excluding hmac
  const queryObj = { ...params } as Record<string, string>;
  delete queryObj.hmac;

  const sortedMessage = Object.keys(queryObj)
    .sort()
    .map((key) => `${key}=${queryObj[key]}`)
    .join("&");

  const calculatedHmac = crypto
    .createHmac("sha256", apiSecret)
    .update(sortedMessage, "utf8")
    .digest("hex");

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(calculatedHmac, "hex"),
      Buffer.from(params.hmac, "hex")
    );
    if (!isValid) {
      return { valid: false, shop: cleanShop, error: "Invalid HMAC signature" };
    }
  } catch {
    return { valid: false, shop: cleanShop, error: "Failed to verify HMAC signature length" };
  }

  return { valid: true, shop: cleanShop };
}

/**
 * Exchanges the temporary OAuth authorization code for a permanent access token.
 */
export async function exchangeOAuthCode(
  params: {
    shopDomain: string;
    code: string;
    clientId: string;
    clientSecret: string;
  },
  fetchFn: typeof fetch = fetch
): Promise<ShopifyTokenResponse> {
  const shop = sanitizeShopDomain(params.shopDomain);
  const endpoint = `https://${shop}/admin/oauth/access_token`;

  const payload = {
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
  };

  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ProviderAuthenticationError(
      "SHOPIFY",
      `Failed to exchange Shopify OAuth code: ${response.status} ${errorText}`,
      { httpStatus: response.status }
    );
  }

  const data = (await response.json()) as ShopifyTokenResponse;
  if (!data.access_token) {
    throw new ProviderAuthenticationError(
      "SHOPIFY",
      "Shopify OAuth token exchange response did not contain access_token"
    );
  }

  return data;
}

/**
 * Secure AES-256-GCM token encryption for persistent storage / referencing.
 */
export function encryptToken(token: string, secretKey: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(secretKey).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  });
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 */
export function decryptToken(encryptedPayload: string, secretKey: string): string {
  try {
    const parsed = JSON.parse(encryptedPayload);
    const iv = Buffer.from(parsed.iv, "hex");
    const tag = Buffer.from(parsed.tag, "hex");
    const data = Buffer.from(parsed.data, "hex");
    const key = crypto.createHash("sha256").update(secretKey).digest();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final("utf8");
  } catch (err: unknown) {
    throw new ProviderAuthenticationError(
      "SHOPIFY",
      "Failed to decrypt stored Shopify token credential"
    );
  }
}
