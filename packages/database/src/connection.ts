import { loadServerConfig } from "@platform/config";

export interface DatabaseConnectionConfig {
  pooledUrl: string;
  directUrl: string;
  isPoolerConfigured: boolean;
}

export function getDatabaseConnectionConfig(): DatabaseConnectionConfig {
  const config = loadServerConfig();
  return {
    pooledUrl: config.DATABASE_URL,
    directUrl: config.DIRECT_URL,
    isPoolerConfigured: Boolean(config.DATABASE_URL)
  };
}
