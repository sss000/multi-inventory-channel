/**
 * Secure Session Cookie Utilities for Next.js SSR and API boundaries
 * Canonical Specification: Prompt 05 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Adheres strictly to @supabase/ssr cookie standards (HttpOnly, Secure, SameSite=Lax).
 */

import { AuthSession } from "@platform/contracts";

export interface CookieOptions {
  isProduction?: boolean;
  domain?: string;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
}

export const ACCESS_TOKEN_COOKIE = "sb-access-token";
export const REFRESH_TOKEN_COOKIE = "sb-refresh-token";

/**
 * Creates Set-Cookie header strings for an authenticated session.
 */
export function createSessionCookies(
  session: AuthSession,
  options: CookieOptions = {}
): string[] {
  const isProd = options.isProduction ?? process.env.NODE_ENV === "production";
  const path = options.path ?? "/";
  const sameSite = options.sameSite ?? "lax";
  const secureFlag = isProd ? "; Secure" : "";
  const domainFlag = options.domain ? `; Domain=${options.domain}` : "";

  const accessCookie = `${ACCESS_TOKEN_COOKIE}=${session.accessToken}; Path=${path}; Max-Age=${session.expiresIn}; HttpOnly; SameSite=${sameSite}${secureFlag}${domainFlag}`;
  // Refresh tokens are given longer retention (e.g. 30 days)
  const refreshMaxAge = 30 * 24 * 60 * 60;
  const refreshCookie = `${REFRESH_TOKEN_COOKIE}=${session.refreshToken}; Path=${path}; Max-Age=${refreshMaxAge}; HttpOnly; SameSite=${sameSite}${secureFlag}${domainFlag}`;

  return [accessCookie, refreshCookie];
}

/**
 * Creates Set-Cookie header strings to immediately invalidate and clear the session.
 */
export function createClearSessionCookies(options: CookieOptions = {}): string[] {
  const isProd = options.isProduction ?? process.env.NODE_ENV === "production";
  const path = options.path ?? "/";
  const sameSite = options.sameSite ?? "lax";
  const secureFlag = isProd ? "; Secure" : "";
  const domainFlag = options.domain ? `; Domain=${options.domain}` : "";

  return [
    `${ACCESS_TOKEN_COOKIE}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=${sameSite}${secureFlag}${domainFlag}`,
    `${REFRESH_TOKEN_COOKIE}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=${sameSite}${secureFlag}${domainFlag}`,
  ];
}

/**
 * Parses session tokens from a standard Cookie header string.
 */
export function parseSessionCookies(cookieHeader?: string): {
  accessToken?: string;
  refreshToken?: string;
} {
  if (!cookieHeader) {
    return {};
  }

  const result: { accessToken?: string; refreshToken?: string } = {};
  const pairs = cookieHeader.split(";").map((p) => p.trim());

  for (const pair of pairs) {
    const [name, ...rest] = pair.split("=");
    if (!name || rest.length === 0) continue;
    const value = rest.join("=");

    if (name === ACCESS_TOKEN_COOKIE) {
      result.accessToken = decodeURIComponent(value);
    } else if (name === REFRESH_TOKEN_COOKIE) {
      result.refreshToken = decodeURIComponent(value);
    }
  }

  return result;
}
