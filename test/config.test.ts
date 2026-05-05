import { describe, expect, it } from "vitest";
import { bundledMsalApp } from "../src/main/auth/app-registration";
import { resolveAppConfig } from "../src/main/config";

describe("app config", () => {
  it("uses bundled multitenant auth defaults when auth env vars are omitted", () => {
    const env: NodeJS.ProcessEnv = {};
    const config = resolveAppConfig(env);

    expect(config.clientId).toBe(bundledMsalApp.clientId);
    expect(config.authority).toBe(bundledMsalApp.authority);
    expect(config.graphScopes).toStrictEqual([
      "openid",
      "profile",
      "offline_access",
      "User.Read",
      "Calendars.ReadWrite",
      "MailboxSettings.Read",
      "Contacts.Read",
    ]);
  });

  it("supports optional development overrides for auth configuration", () => {
    const env: NodeJS.ProcessEnv = {
      GRAPH_SCOPES: "User.Read Calendars.ReadWrite MailboxSettings.Read Contacts.Read",
      MSAL_AUTHORITY: "https://login.microsoftonline.com/example.onmicrosoft.com",
      MSAL_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
    };
    const config = resolveAppConfig(env);

    expect(config.clientId).toBe(env.MSAL_CLIENT_ID);
    expect(config.authority).toBe(env.MSAL_AUTHORITY);
    expect(config.graphScopes).toStrictEqual([
      "User.Read",
      "Calendars.ReadWrite",
      "MailboxSettings.Read",
      "Contacts.Read",
    ]);
  });

  it("ignores the legacy MSAL_REDIRECT_URI override", () => {
    const env: NodeJS.ProcessEnv = {
      MSAL_REDIRECT_URI: "http://localhost",
    };
    const config = resolveAppConfig(env);

    expect(config.clientId).toBe(bundledMsalApp.clientId);
    expect(config.authority).toBe(bundledMsalApp.authority);
  });

  it("defaults sync window days to a year back and 90 days forward", () => {
    const config = resolveAppConfig({});

    expect(config.syncLookBehindDays).toBe(365);
    expect(config.syncLookAheadDays).toBe(90);
  });

  it("accepts SYNC_LOOKBEHIND_DAYS up to the 3650-day maximum", () => {
    const config = resolveAppConfig({ SYNC_LOOKBEHIND_DAYS: "3650" });

    expect(config.syncLookBehindDays).toBe(3650);
  });

  it("rejects SYNC_LOOKBEHIND_DAYS above the 3650-day maximum", () => {
    expect(() => resolveAppConfig({ SYNC_LOOKBEHIND_DAYS: "3651" })).toThrow();
  });
});
