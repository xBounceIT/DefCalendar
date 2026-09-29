import type { AccountInfo, AuthenticationResult } from "@azure/msal-node";
import { describe, expect, it, vi } from "vitest";
import MsalAuthService from "../src/main/auth/msal-auth-service";
import { InteractionRequiredAuthError } from "../src/main/auth/msal-runtime";
import { resolveAppConfig } from "../src/main/config";
import { authStateSchema } from "../src/shared/schemas";

const account: AccountInfo = {
  homeAccountId: "account-1",
  localAccountId: "local-1",
  environment: "login.microsoftonline.com",
  tenantId: "tenant-1",
  username: "one@example.com",
};

function createDeferredToken() {
  let resolve!: (result: AuthenticationResult) => void;
  const promise = new Promise<AuthenticationResult>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createToken(scopes = resolveAppConfig({}).graphScopes): AuthenticationResult {
  return { account, accessToken: "token", scopes } as AuthenticationResult;
}

function createFixture(accounts = [account], graphScopes = resolveAppConfig({}).graphScopes) {
  const config = { ...resolveAppConfig({}), clientId: "test-client-id", graphScopes };
  const service = new MsalAuthService(config, { createPlugin: () => ({}) } as never);
  const pca = {
    acquireTokenSilent: vi.fn().mockImplementation(async ({ account: requested }) => ({
      accessToken: "opaque-graph-token",
      account: requested,
      scopes: graphScopes.filter(
        (scope) => !["openid", "profile", "offline_access"].includes(scope),
      ),
    })),
    acquireTokenInteractive: vi.fn(),
    getAllAccounts: vi.fn().mockResolvedValue(accounts),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
  const db = {
    getAccounts: vi.fn().mockReturnValue([]),
    saveAccounts: vi.fn(),
    clearUserData: vi.fn(),
  };
  const settings = {
    getSettings: () => ({ activeAccountId: account.homeAccountId }),
    updateSettings: vi.fn(),
  };
  Object.defineProperty(service, "pca", { value: pca });
  service.setDatabase(db);
  service.setSettings(settings);
  return { service, pca, db, settings, config };
}

describe("startup session permission validation", () => {
  it("still clears account data and notifies the UI if MSAL token eviction fails", async () => {
    expect.hasAssertions();
    const { service, pca, db } = createFixture();
    await service.initialize();
    const listener = vi.fn();
    service.onSessionValidation(listener);
    pca.signOut.mockRejectedValue(new Error("token cache cannot be written"));
    pca.acquireTokenSilent.mockResolvedValue(createToken(["User.Read"]));

    await expect(service.getAccessToken(true)).rejects.toThrow("required permissions");

    expect(db.clearUserData).toHaveBeenCalledWith(account.homeAccountId);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ status: "signed_out" }),
      account.homeAccountId,
    );
  });

  it("allows startup and manual logout to complete despite token-cache eviction errors", async () => {
    expect.hasAssertions();
    const { service, pca, db } = createFixture();
    pca.signOut.mockRejectedValue(new Error("token cache cannot be written"));
    pca.acquireTokenSilent.mockResolvedValue(createToken(["User.Read"]));
    await expect(service.initialize()).resolves.toBeUndefined();
    expect(db.clearUserData).toHaveBeenCalledWith(account.homeAccountId);
    pca.acquireTokenInteractive.mockResolvedValue(createToken());
    await service.signIn();
    await expect(service.signOut()).resolves.toBeUndefined();
    expect(service.hasSession()).toBe(false);
  });

  it("attempts to evict all accounts even when the first token-cache eviction fails", async () => {
    expect.hasAssertions();
    const secondAccount = { ...account, homeAccountId: "account-2" };
    const { service, pca } = createFixture([account, secondAccount]);
    await service.initialize();
    pca.signOut.mockRejectedValueOnce(new Error("token cache cannot be written"));

    await expect(service.signOutAll()).resolves.toBeUndefined();

    expect(service.hasSession()).toBe(false);
    expect(pca.signOut).toHaveBeenCalledTimes(2);
  });

  it("notifies subscribers of automatic sign-out with the permission failure reason", async () => {
    expect.hasAssertions();
    const { service, pca, db } = createFixture();
    await service.initialize();
    const listener = vi.fn();
    service.onSessionValidation(listener);
    pca.acquireTokenSilent.mockResolvedValueOnce(createToken(["User.Read"]));

    await expect(service.getAccessToken(true)).rejects.toThrow("required permissions");

    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        status: "signed_out",
        sessionIssues: [expect.objectContaining({ reason: "missing_permissions" })],
      }),
      account.homeAccountId,
    );
    expect(db.clearUserData).toHaveBeenCalledWith(account.homeAccountId);
  });

  it("notifies subscribers when unavailable validation recovers and respects unsubscribe", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    const listener = vi.fn();
    const unsubscribe = service.onSessionValidation(listener);
    pca.acquireTokenSilent.mockRejectedValueOnce(new Error("offline"));
    await service.initialize();
    pca.acquireTokenSilent.mockRejectedValueOnce(new Error("still offline"));
    await expect(service.getAccessToken()).rejects.toThrow("Unable to validate");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "signed_in",
        sessionIssues: [expect.objectContaining({ reason: "validation_unavailable" })],
      }),
      undefined,
    );

    pca.acquireTokenSilent.mockResolvedValue(createToken());
    await service.getAccessToken();
    expect(listener).toHaveBeenLastCalledWith(service.getAuthState(), undefined);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    pca.acquireTokenSilent.mockResolvedValue(createToken(["User.Read"]));
    await expect(service.getAccessToken(true)).rejects.toThrow("required permissions");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("bounds startup verification to one timeout for multiple unresponsive accounts", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    try {
      const accounts = Array.from({ length: 3 }, (_, index) => ({
        ...account,
        homeAccountId: `account-${index + 1}`,
      }));
      const { service, pca } = createFixture(accounts);
      pca.acquireTokenSilent.mockReturnValue(new Promise(() => undefined));
      let completed = false;
      const startup = service.initialize().then(() => {
        completed = true;
      });

      await vi.advanceTimersByTimeAsync(15_000);

      expect(completed).toBe(true);
      await startup;
      expect(service.getAuthState().sessionIssues).toHaveLength(3);
      expect(pca.signOut).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a silently refreshed token if it drops a required permission", async () => {
    expect.hasAssertions();
    const { service, pca, db } = createFixture();
    await service.initialize();
    pca.acquireTokenSilent.mockResolvedValue(createToken(["User.Read"]));

    await expect(service.getAccessToken(true)).rejects.toThrow("required permissions");

    expect(service.hasSession()).toBe(false);
    expect(db.clearUserData).toHaveBeenCalledWith(account.homeAccountId);
    expect(pca.acquireTokenInteractive).not.toHaveBeenCalled();
  });

  it("removes every incomplete account during concurrent startup validation", async () => {
    expect.hasAssertions();
    const secondAccount = { ...account, homeAccountId: "account-2", username: "two@example.com" };
    const { service, pca, db } = createFixture([account, secondAccount]);
    pca.acquireTokenSilent.mockImplementation(async ({ account: requested }) => ({
      account: requested,
      accessToken: "token",
      scopes: ["User.Read"],
    }));

    await service.initialize();

    expect(service.hasSession()).toBe(false);
    expect(service.getAuthState().sessionIssues).toHaveLength(2);
    expect(db.clearUserData.mock.calls).toEqual([
      [account.homeAccountId],
      [secondAccount.homeAccountId],
    ]);
    expect(pca.signOut).toHaveBeenCalledTimes(2);
  });

  it("invalidates captured operations when permission validation signs out and the same account returns", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    await service.initialize();
    const assertSession = service.createAccountSessionGuard(account.homeAccountId);
    pca.acquireTokenSilent.mockResolvedValueOnce(createToken(["User.Read"]));
    await expect(service.getAccessToken(true)).rejects.toThrow("required permissions");
    pca.acquireTokenInteractive.mockResolvedValue(createToken());
    await service.signIn();

    expect(service.hasSession()).toBe(true);
    expect(assertSession).toThrow("session changed");
    expect(service.createAccountSessionGuard(account.homeAccountId)).not.toThrow();
  });

  it("keeps captured operations current during an interactive token renewal", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    await service.initialize();
    const assertSession = service.createAccountSessionGuard(account.homeAccountId);
    pca.acquireTokenSilent.mockRejectedValueOnce(new Error("renew token"));
    pca.acquireTokenInteractive.mockResolvedValue(createToken());

    await expect(service.getAccessToken()).resolves.toBe("token");
    expect(assertSession).not.toThrow();
  });

  it("does not let an old permission check sign out a newly authenticated session", async () => {
    expect.hasAssertions();
    const { service, pca, db } = createFixture();
    pca.acquireTokenSilent.mockRejectedValueOnce(new Error("offline"));
    await service.initialize();
    const deferred = createDeferredToken();
    pca.acquireTokenSilent.mockReturnValueOnce(deferred.promise);
    const oldRequest = service.getAccessToken();
    const rejectedRequest = oldRequest.catch((error: unknown) => error);
    await vi.waitFor(() => expect(pca.acquireTokenSilent).toHaveBeenCalledTimes(2));
    pca.acquireTokenInteractive.mockResolvedValue(createToken());
    await service.signIn();
    deferred.resolve(createToken(["User.Read"]));
    await expect(rejectedRequest).resolves.toHaveProperty(
      "message",
      expect.stringContaining("session changed"),
    );

    expect(service.hasSession()).toBe(true);
    expect(service.getAuthState().sessionIssues).toBeUndefined();
    expect(db.clearUserData).not.toHaveBeenCalled();
    expect(pca.signOut).not.toHaveBeenCalled();
  });

  it("does not deliver a token when logout occurs while a check is pending", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    pca.acquireTokenSilent.mockRejectedValueOnce(new Error("offline"));
    await service.initialize();
    const deferred = createDeferredToken();
    pca.acquireTokenSilent.mockReturnValueOnce(deferred.promise);
    const request = service.getAccessToken();
    const rejectedRequest = request.catch((error: unknown) => error);
    await vi.waitFor(() => expect(pca.acquireTokenSilent).toHaveBeenCalledTimes(2));
    await service.signOut();
    deferred.resolve(createToken());
    await expect(rejectedRequest).resolves.toHaveProperty(
      "message",
      expect.stringContaining("session changed"),
    );

    expect(service.hasSession()).toBe(false);
    expect(service.getAuthState().sessionIssues).toBeUndefined();
  });

  it("does not rediscover a signed-out account from stale MSAL cache entries", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    await service.initialize();
    await service.signOut();

    await expect(service.getAccessTokenForAccount(account.homeAccountId)).rejects.toThrow(
      "Sign in",
    );

    expect(service.hasSession()).toBe(false);
    expect(pca.getAllAccounts).toHaveBeenCalledTimes(1);
    expect(pca.acquireTokenSilent).toHaveBeenCalledTimes(1);
  });

  it("clears a deferred-verification warning on manual logout", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    pca.acquireTokenSilent.mockRejectedValue(new Error("offline"));
    await service.initialize();
    await service.signOut();
    expect(service.getAuthState()).toEqual({ status: "signed_out", accounts: [] });
  });

  it("removes credentials written by a silent token response that arrives after logout", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    await service.initialize();
    let cachedAccounts = [account];
    pca.getAllAccounts.mockImplementation(async () => cachedAccounts);
    pca.signOut.mockImplementation(async () => {
      cachedAccounts = [];
    });
    const deferred = createDeferredToken();
    pca.acquireTokenSilent.mockImplementationOnce(async () => {
      const result = await deferred.promise;
      cachedAccounts = [account];
      return result;
    });
    const request = service.getAccessToken();
    const rejectedRequest = request.catch((error: unknown) => error);
    await service.signOut();
    deferred.resolve(createToken());
    await expect(rejectedRequest).resolves.toHaveProperty(
      "message",
      expect.stringContaining("session changed"),
    );
    await expect(pca.getAllAccounts()).resolves.toEqual([]);
  });

  it("does not cache an unexpected account when a sync refresh prompts for sign-in", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    await service.initialize();
    const otherAccount = { ...account, homeAccountId: "other-account" };
    pca.acquireTokenSilent.mockRejectedValueOnce(
      new InteractionRequiredAuthError("interaction_required"),
    );
    pca.acquireTokenInteractive.mockResolvedValue({ ...createToken(), account: otherAccount });

    await expect(service.getAccessToken()).rejects.toThrow("Unable to refresh");

    expect(service.getAccountIds()).toEqual([account.homeAccountId]);
    expect(pca.signOut).toHaveBeenCalledWith({ account: otherAccount });
  });

  it("does not finish signing in if global logout runs between token validation and account registration", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture([]);
    pca.acquireTokenInteractive.mockImplementation(async () => {
      queueMicrotask(() =>
        queueMicrotask(() => {
          void service.signOutAll();
        }),
      );
      return createToken();
    });

    await expect(service.signIn()).rejects.toThrow("session changed");

    expect(service.hasSession()).toBe(false);
    expect(pca.signOut).toHaveBeenCalledWith({ account });
  });

  it("waits for an outstanding logout before acquiring a replacement interactive token", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    await service.initialize();
    let completeLogout!: () => void;
    pca.signOut.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        completeLogout = resolve;
      }),
    );
    const logout = service.signOut();
    pca.acquireTokenInteractive.mockResolvedValue(createToken());
    const login = service.signIn();
    await Promise.resolve();
    expect(pca.acquireTokenInteractive).not.toHaveBeenCalled();
    completeLogout();
    await logout;
    await login;
    expect(service.hasSession()).toBe(true);
  });
  it("refreshes all configured scopes and accepts Graph permissions without identity scopes", async () => {
    expect.hasAssertions();
    const { service, pca, config } = createFixture();

    await service.initialize();

    expect(pca.acquireTokenSilent).toHaveBeenCalledWith({
      account,
      scopes: config.graphScopes,
      forceRefresh: true,
    });
    expect(service.getAuthState().status).toBe("signed_in");
    expect(service.getAuthState().sessionIssues).toBeUndefined();
    expect(pca.signOut).not.toHaveBeenCalled();
    expect(pca.acquireTokenInteractive).not.toHaveBeenCalled();
  });

  it("automatically requires a newly configured permission and removes the invalid account data", async () => {
    expect.hasAssertions();
    const scopes = [...resolveAppConfig({}).graphScopes, "Tasks.ReadWrite"];
    const { service, pca, db, settings } = createFixture([account], scopes);
    pca.acquireTokenSilent.mockResolvedValue({
      account,
      accessToken: "token",
      scopes: scopes.filter((scope) => scope !== "Tasks.ReadWrite"),
    });

    await service.initialize();

    expect(service.hasSession()).toBe(false);
    expect(pca.signOut).toHaveBeenCalledWith({ account });
    expect(db.clearUserData).toHaveBeenCalledWith(account.homeAccountId);
    expect(settings.updateSettings).toHaveBeenCalledWith({ activeAccountId: null });
    expect(authStateSchema.parse(service.getAuthState())).toEqual({
      status: "signed_out",
      accounts: [],
      sessionIssues: [
        {
          homeAccountId: account.homeAccountId,
          username: account.username,
          reason: "missing_permissions",
          missingPermissions: ["Tasks.ReadWrite"],
        },
      ],
    });
    expect(service.getAccountIds()).toEqual([]);
    expect(pca.acquireTokenInteractive).not.toHaveBeenCalled();
  });

  it("normalizes Graph scope URLs and casing without treating another resource as Graph", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture([account], ["https://graph.microsoft.com/User.Read"]);
    pca.acquireTokenSilent.mockResolvedValueOnce({
      account,
      accessToken: "token",
      scopes: ["user.read"],
    });
    await service.initialize();
    expect(service.hasSession()).toBe(true);

    const other = createFixture([account], ["User.Read"]);
    other.pca.acquireTokenSilent.mockResolvedValue({
      account,
      accessToken: "token",
      scopes: ["api://other/User.Read"],
    });
    await other.service.initialize();
    expect(other.service.getAuthState().sessionIssues?.[0].missingPermissions).toEqual([
      "User.Read",
    ]);
  });

  it("validates inactive accounts and preserves the valid account when the active one is invalid", async () => {
    expect.hasAssertions();
    const secondAccount = { ...account, homeAccountId: "account-2", username: "two@example.com" };
    const { service, pca, db } = createFixture([account, secondAccount]);
    pca.acquireTokenSilent.mockResolvedValueOnce({
      account,
      accessToken: "token",
      scopes: ["User.Read"],
    });

    await service.initialize();

    expect(pca.acquireTokenSilent).toHaveBeenCalledTimes(2);
    expect(pca.signOut).toHaveBeenCalledExactlyOnceWith({ account });
    expect(db.clearUserData).toHaveBeenCalledExactlyOnceWith(account.homeAccountId);
    expect(service.getActiveAccountId()).toBe(secondAccount.homeAccountId);
    expect(service.getAccountIds()).toEqual([secondAccount.homeAccountId]);
    expect(service.getAuthState().status).toBe("signed_in");
    expect(service.getAuthState().sessionIssues?.[0].username).toBe(account.username);
  });

  it.each([
    [new InteractionRequiredAuthError("consent_required"), "consent_required"],
    [new InteractionRequiredAuthError("interaction_required"), "session_expired"],
    [{ errorCode: "invalid_grant" }, "session_expired"],
    [{ errorCode: "no_tokens_found" }, "session_expired"],
    [{ errorCode: "invalid_grant", subError: "consent_required" }, "consent_required"],
    [
      new InteractionRequiredAuthError(
        "invalid_grant",
        "AADSTS65001: The user or administrator has not consented",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "65001",
      ),
      "consent_required",
    ],
  ])("signs out sessions requiring renewed access (%j)", async (error, reason) => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    pca.acquireTokenSilent.mockRejectedValue(error);

    await service.initialize();

    expect(service.hasSession()).toBe(false);
    expect(service.getAuthState().sessionIssues?.[0].reason).toBe(reason);
    expect(pca.acquireTokenInteractive).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { account, accessToken: "", scopes: ["User.Read"] },
    {
      account: { ...account, homeAccountId: "wrong-account" },
      accessToken: "token",
      scopes: ["User.Read"],
    },
  ])("rejects missing or mismatched session tokens (%j)", async (result) => {
    expect.hasAssertions();
    const { service, pca } = createFixture([account], ["User.Read"]);
    pca.acquireTokenSilent.mockResolvedValue(result);
    await service.initialize();
    expect(service.hasSession()).toBe(false);
    expect(service.getAuthState().sessionIssues?.[0].reason).toBe("session_expired");
  });

  it("retains sessions on network failure and blocks Graph tokens until verification succeeds", async () => {
    expect.hasAssertions();
    const { service, pca, db } = createFixture();
    pca.acquireTokenSilent.mockRejectedValue(new Error("network unavailable"));

    await service.initialize();
    await expect(service.getAccessToken()).rejects.toThrow("Unable to validate");

    expect(service.hasSession()).toBe(true);
    expect(service.getAuthState().sessionIssues?.[0].reason).toBe("validation_unavailable");
    expect(pca.signOut).not.toHaveBeenCalled();
    expect(db.clearUserData).not.toHaveBeenCalled();
    expect(pca.acquireTokenInteractive).not.toHaveBeenCalled();

    pca.acquireTokenSilent.mockResolvedValue({
      account,
      accessToken: "recovered-token",
      scopes: resolveAppConfig({}).graphScopes,
    });
    await expect(service.getAccessToken()).resolves.toBe("recovered-token");
    expect(service.getAuthState().sessionIssues).toBeUndefined();
  });

  it("shares a verified token across concurrent recovery requests without refreshing it twice", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture();
    pca.acquireTokenSilent.mockRejectedValueOnce(new Error("offline"));
    await service.initialize();
    pca.acquireTokenSilent.mockClear();
    pca.acquireTokenSilent.mockResolvedValue(createToken());

    await expect(
      Promise.all([
        service.getAccessToken(true),
        service.getAccessTokenForAccount(account.homeAccountId, true),
      ]),
    ).resolves.toStrictEqual(["token", "token"]);

    expect(pca.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({
      account,
      scopes: resolveAppConfig({}).graphScopes,
      forceRefresh: true,
    });
    expect(service.getAuthState().sessionIssues).toBeUndefined();
  });

  it("allows startup to finish when Microsoft never responds, without accepting a late unchecked token", async () => {
    expect.hasAssertions();
    vi.useFakeTimers();
    try {
      const { service, pca } = createFixture();
      let resolveToken!: (result: unknown) => void;
      pca.acquireTokenSilent.mockReturnValue(
        new Promise((resolve) => {
          resolveToken = resolve;
        }),
      );
      const startup = service.initialize();
      await vi.advanceTimersByTimeAsync(15_000);
      await startup;

      expect(service.getAuthState().sessionIssues?.[0].reason).toBe("validation_unavailable");
      expect(pca.signOut).not.toHaveBeenCalled();
      resolveToken({ account, accessToken: "late-token", scopes: [] });
      await vi.advanceTimersByTimeAsync(0);
      expect(service.getAuthState().sessionIssues?.[0].reason).toBe("validation_unavailable");
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes the saved account when a deferred check later confirms missing permissions", async () => {
    expect.hasAssertions();
    const { service, pca, db } = createFixture();
    pca.acquireTokenSilent.mockRejectedValueOnce(new Error("offline"));
    await service.initialize();
    pca.acquireTokenSilent.mockResolvedValue({
      account,
      accessToken: "token",
      scopes: ["User.Read"],
    });

    await expect(service.getAccessTokenForAccount(account.homeAccountId)).rejects.toThrow(
      "Unable to validate",
    );

    expect(service.hasSession()).toBe(false);
    expect(service.getAuthState().sessionIssues?.[0].reason).toBe("missing_permissions");
    expect(db.clearUserData).toHaveBeenCalledWith(account.homeAccountId);
    expect(pca.acquireTokenInteractive).not.toHaveBeenCalled();
  });

  it("rejects incomplete consent at the next interactive sign-in", async () => {
    expect.hasAssertions();
    const { service, pca } = createFixture([], ["User.Read", "Tasks.ReadWrite"]);
    pca.acquireTokenInteractive.mockResolvedValue({
      account,
      accessToken: "token",
      scopes: ["User.Read"],
    });

    await expect(service.signIn()).rejects.toThrow("Tasks.ReadWrite");

    expect(service.hasSession()).toBe(false);
    expect(pca.signOut).toHaveBeenCalledWith({ account });
  });
});
