import { z } from "zod";

export const ServerEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  API_PORT: z.coerce.number().default(4000),
  WEB_PORT: z.coerce.number().default(3000),
  ADMIN_PORT: z.coerce.number().default(3001),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .default("http://127.0.0.1:54321"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .default("sb_publishable_placeholder_dev_key"),
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1)
    .default("sb_secret_placeholder_dev_key"),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
  DIRECT_URL: z
    .string()
    .default("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
  REDIS_URL: z
    .string()
    .default("redis://127.0.0.1:6379"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000")
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export const ClientEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .default("http://127.0.0.1:54321"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .default("sb_publishable_placeholder_dev_key"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000")
});

export type ClientEnv = z.infer<typeof ClientEnvSchema>;

export function loadServerConfig(env: Record<string, string | undefined> = process.env): ServerEnv {
  const result = ServerEnvSchema.safeParse(env);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`[Configuration Error] Invalid server environment:\n${errorDetails}`);
  }
  return result.data;
}

export function loadClientConfig(env: Record<string, string | undefined> = process.env): ClientEnv {
  const result = ClientEnvSchema.safeParse(env);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`[Configuration Error] Invalid client environment:\n${errorDetails}`);
  }
  return result.data;
}
