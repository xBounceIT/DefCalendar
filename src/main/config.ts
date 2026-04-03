import { bundledMsalApp } from "@main/auth/app-registration";
import dotenv from "dotenv";
import { z } from "zod";

const envSchema = z.object({
  MSAL_AUTHORITY: z.string().url().optional(),
  MSAL_CLIENT_ID: z.string().min(1).optional(),
  GRAPH_SCOPES: z
    .string()
    .default("openid profile offline_access User.Read Calendars.ReadWrite MailboxSettings.Read"),
  SYNC_LOOKAHEAD_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  SYNC_LOOKBEHIND_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(1),
});

interface AppConfig {
  clientId: string;
  authority: string;
  graphScopes: string[];
  syncLookAheadDays: number;
  syncLookBehindDays: number;
  syncIntervalMinutes: number;
  timeZone: string;
}

let cachedConfig: AppConfig | null = null;

function resolveAppConfig(envInput: NodeJS.ProcessEnv): AppConfig {
  const env = envSchema.parse(envInput);

  return {
    clientId: env.MSAL_CLIENT_ID ?? bundledMsalApp.clientId,
    authority: env.MSAL_AUTHORITY ?? bundledMsalApp.authority,
    graphScopes: env.GRAPH_SCOPES.split(/\s+/).filter(Boolean),
    syncLookAheadDays: env.SYNC_LOOKAHEAD_DAYS,
    syncLookBehindDays: env.SYNC_LOOKBEHIND_DAYS,
    syncIntervalMinutes: env.SYNC_INTERVAL_MINUTES,
    timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

function loadAppConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  dotenv.config();
  cachedConfig = resolveAppConfig(process.env);

  return cachedConfig;
}

export { loadAppConfig, resolveAppConfig, type AppConfig };
