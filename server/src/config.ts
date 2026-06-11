import dotenv from "dotenv";

// Read .env once at boot; everything downstream imports the typed `config`.
dotenv.config();

export interface Config {
  /** Runtime data directory: app.db, backups/, uploads/, books/ all live under it. */
  dataDir: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  anthropicApiKey: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  const nodeEnv =
    env.NODE_ENV === "production"
      ? "production"
      : env.NODE_ENV === "test"
        ? "test"
        : "development";
  return {
    dataDir: env.DATA_DIR ?? "./data",
    port,
    nodeEnv,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
  };
}

export const config: Config = loadConfig(process.env);
