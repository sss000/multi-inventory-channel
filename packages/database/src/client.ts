import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadServerConfig } from "@platform/config";
import type { Database } from "./schema/types.js";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Creates a server-only administrative Supabase client using the secret service-role key.
 * STRICTLY FORBIDDEN IN BROWSER CODE.
 */
export function createAdminClient(customUrl?: string, customSecretKey?: string): TypedSupabaseClient {
  const config = loadServerConfig();
  const url = customUrl || config.NEXT_PUBLIC_SUPABASE_URL;
  const key = customSecretKey || config.SUPABASE_SECRET_KEY;

  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is required to initialize the admin client.");
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Creates a standard Supabase client using the publishable (anon) key.
 * Governed strictly by PostgreSQL Row Level Security (RLS).
 */
export function createPublishableClient(customUrl?: string, customKey?: string): TypedSupabaseClient {
  const config = loadServerConfig();
  const url = customUrl || config.NEXT_PUBLIC_SUPABASE_URL;
  const key = customKey || config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return createClient<Database>(url, key, {
    auth: {
      persistSession: true
    }
  });
}

