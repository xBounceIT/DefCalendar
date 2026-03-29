import { describe, expect, it, vi } from "vitest";

import MsalAuthService from "../src/main/auth/msal-auth-service";

describe("msal auth service", () => {
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
        };
      }
    ).pca = {
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
