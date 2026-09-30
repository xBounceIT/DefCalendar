import { describe, expect, it, vi } from "vitest";

import MsalAuthService from "../src/main/auth/msal-auth-service";
import { resolveAppConfig } from "../src/main/config";

describe("msal auth service", () => {
  it("keeps background token retries silent when renewed sign-in is required", async () => {
    const config = resolveAppConfig({});
    const service = new MsalAuthService(config, {
      createPlugin: vi.fn().mockReturnValue({}),
    } as never);
    const account = {
      homeAccountId: "account-1",
      username: "user@example.com",
      tenantId: "tenant-1",
    };
    const acquireTokenSilent = vi
      .fn()
      .mockResolvedValueOnce({
        account,
        accessToken: "cached-token",
        scopes: config.graphScopes,
      })
      .mockRejectedValue(new Error("Consent required"));
    const acquireTokenInteractive = vi.fn().mockResolvedValue({
      account,
      accessToken: "interactive-token",
      scopes: config.graphScopes,
    });
    Object.assign(service, {
      pca: {
        getAllAccounts: vi.fn().mockResolvedValue([account]),
        acquireTokenSilent,
        acquireTokenInteractive,
      },
    });
    await service.initialize();
    await expect(service.getAccessTokenForAccount("account-1", false, false)).rejects.toThrow(
      "Consent required",
    );
    expect(acquireTokenInteractive).not.toHaveBeenCalled();
  });

  it("requests directory photo permission when an existing session needs renewed consent", async () => {
    const config = resolveAppConfig({});
    const service = new MsalAuthService(config, {
      createPlugin: vi.fn().mockReturnValue({}),
    } as never);
    const account = {
      homeAccountId: "account-1",
      name: "Test User",
      tenantId: "tenant-1",
      username: "user@example.com",
    };
    const acquireTokenSilent = vi
      .fn()
      .mockResolvedValueOnce({ account, accessToken: "cached-token", scopes: config.graphScopes })
      .mockRejectedValue(new Error("Consent required"));
    const acquireTokenInteractive = vi
      .fn()
      .mockResolvedValue({ account, accessToken: "photo-token", scopes: config.graphScopes });
    Object.assign(service, {
      pca: {
        getAllAccounts: vi.fn().mockResolvedValue([account]),
        acquireTokenSilent,
        acquireTokenInteractive,
      },
    });
    await service.initialize();
    await expect(service.getAccessTokenForAccount("account-1")).resolves.toBe("photo-token");
    expect(acquireTokenSilent).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        scopes: expect.arrayContaining(["User.ReadBasic.All"]),
      }),
    );
    expect(acquireTokenInteractive).toHaveBeenCalledWith(
      expect.objectContaining({
        loginHint: account.username,
        scopes: config.graphScopes,
      }),
    );
  });

  it("returns stable colors for accounts without stored colors", async () => {
    const service = new MsalAuthService(
      {
        authority: "https://login.microsoftonline.com/organizations",
        clientId: "test-client-id",
        graphScopes: ["User.Read"],
        syncIntervalMinutes: 5,
        syncLookAheadDays: 30,
        syncLookBehindDays: 30,
        timeZone: "UTC",
      },
      {
        createPlugin: vi.fn().mockReturnValue({}),
      } as never,
    );

    (
      service as unknown as {
        pca: {
          getAllAccounts: ReturnType<typeof vi.fn>;
          acquireTokenSilent: ReturnType<typeof vi.fn>;
        };
      }
    ).pca = {
      acquireTokenSilent: vi.fn().mockResolvedValue({
        accessToken: "token",
        account: { homeAccountId: "account-1" },
        scopes: ["User.Read"],
      }),
      getAllAccounts: vi.fn().mockResolvedValue([
        {
          homeAccountId: "account-1",
          name: "Test User",
          tenantId: "tenant-1",
          username: "user@example.com",
        },
      ]),
    };

    await service.initialize();

    const firstState = service.getAuthState();
    const secondState = service.getAuthState();

    expect(firstState.status).toBe("signed_in");
    expect(secondState.status).toBe("signed_in");

    if (firstState.status !== "signed_in" || secondState.status !== "signed_in") {
      throw new Error("Expected a signed-in auth state.");
    }

    expect(firstState.account.color).toBe(firstState.accounts[0]?.color);
    expect(secondState.account.color).toBe(firstState.account.color);
    expect(secondState.accounts[0]?.color).toBe(firstState.account.color);
  });

  it("signs out all accounts for a global sign out", async () => {
    const service = new MsalAuthService(
      {
        authority: "https://login.microsoftonline.com/organizations",
        clientId: "test-client-id",
        graphScopes: ["User.Read"],
        syncIntervalMinutes: 5,
        syncLookAheadDays: 30,
        syncLookBehindDays: 30,
        timeZone: "UTC",
      },
      {
        createPlugin: vi.fn().mockReturnValue({}),
      } as never,
    );

    const saveAccounts = vi.fn();
    const updateSettings = vi.fn();
    service.setDatabase({
      getAccounts: vi.fn().mockReturnValue([]),
      saveAccounts,
      clearUserData: vi.fn(),
    });
    service.setSettings({
      getSettings: vi.fn().mockReturnValue({ activeAccountId: "account-1" }),
      updateSettings,
    });

    const signOut = vi.fn().mockResolvedValue(undefined);
    (
      service as unknown as {
        accounts: { homeAccountId: string; username: string }[];
        activeAccountId: string | null;
        pca: { signOut: typeof signOut };
      }
    ).accounts = [
      { homeAccountId: "account-1", username: "one@example.com" },
      { homeAccountId: "account-2", username: "two@example.com" },
    ];
    (
      service as unknown as {
        accounts: { homeAccountId: string; username: string }[];
        activeAccountId: string | null;
        pca: { signOut: typeof signOut };
      }
    ).activeAccountId = "account-1";
    (
      service as unknown as {
        accounts: { homeAccountId: string; username: string }[];
        activeAccountId: string | null;
        pca: { signOut: typeof signOut };
      }
    ).pca = { signOut };

    await service.signOutAll();

    expect(signOut.mock.calls).toStrictEqual([
      [{ account: { homeAccountId: "account-1", username: "one@example.com" } }],
      [{ account: { homeAccountId: "account-2", username: "two@example.com" } }],
    ]);
    expect(saveAccounts).toHaveBeenCalledWith([]);
    expect(updateSettings).toHaveBeenCalledWith({ activeAccountId: null });
    expect(service.getAuthState()).toStrictEqual({ status: "signed_out", accounts: [] });
  });
});
