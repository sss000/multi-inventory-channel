/**
 * Next.js SSR Supabase Client & Cookie Boundary
 * Canonical Specification: Prompt 05 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Implements cookie-based session management adhering to @supabase/ssr conventions.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadClientConfig } from "@platform/config";
import { parseSessionCookies, createSessionCookies, createClearSessionCookies } from "@platform/security";

export interface SsrCookieStore {
  get(name: string): string | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  remove(name: string, options?: Record<string, unknown>): void;
}

/**
 * Creates a server-side Supabase client for Next.js SSR / Server Components / Actions
 * that reads/writes session tokens via secure HTTP cookies.
 */
export function createServerComponentClient(cookieHeader?: string): {
  supabase: SupabaseClient;
  session: { accessToken?: string; refreshToken?: string };
} {
  const config = loadClientConfig();
  const session = parseSessionCookies(cookieHeader);

  const supabase = createClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: session.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {},
      },
    }
  );

  return { supabase, session };
}
