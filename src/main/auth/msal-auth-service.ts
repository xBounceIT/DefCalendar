import type { AccountInfo, AuthenticationResult, Configuration } from "@azure/msal-node";
import { shell } from "electron";
import { LogLevel, PublicClientApplication } from "@main/auth/msal-runtime";
import { getSignInPrompt, normalizeMicrosoftSignInError } from "@main/auth/auth-sign-in";
import { hasConfiguredClientId } from "@main/auth/app-registration";
import {
  classifySessionValidationError,
  validateSessionPermissions,
  type SessionValidationError,
} from "@main/auth/session-permissions";
import type { AppConfig } from "@main/config";
import type { AuthSessionIssue, AuthSignInMode, AuthState, StoredAccount } from "@shared/schemas";
import type SafeStorageTokenCache from "@main/auth/cache-plugin";
import { EXCHANGE365_CLIENT_ID_NOT_CONFIGURED_MESSAGE } from "@shared/exchange-auth";

const ACCOUNT_COLORS = [
  "#4F46E5",
  "#059669",
  "#DC2626",
  "#D97706",
  "#7C3AED",
  "#0891B2",
  "#DB2777",
  "#65A30D",
  "#EA580C",
  "#0D9488",
];

const SESSION_VALIDATION_TIMEOUT_MS = 15_000;

function buildSuccessTemplate(): string {
  return `
    <html>
      <body style="font-family: Segoe UI, sans-serif; background:#e0e5ec; color:#2d3748; display:grid; place-items:center; height:100vh; margin:0;">
        <div style="width: min(400px, 90%); min-height: 300px; padding: 48px; background:#e0e5ec; border-radius:24px; box-shadow: 20px 20px 60px #bec3c9, -20px -20px 60px #ffffff; display: flex; flex-direction: column;">
          <div style="margin-bottom: auto;">
            <h1 style="margin:0; font-size:32px; font-weight:600; text-align:left; color:#2d3748;">DefCalendar connected</h1>
            <p style="margin:12px 0 0; font-size:15px; color:#718096; text-align:left; line-height:1.5;">You can close this browser tab and return to the desktop app.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function buildErrorTemplate(): string {
  return `
    <html>
      <body style="font-family: Segoe UI, sans-serif; background:#fff5f3; color:#4b1f17; display:grid; place-items:center; height:100vh; margin:0;">
        <div style="max-width:480px; padding:32px; background:white; border-radius:24px; box-shadow:0 20px 60px rgba(75,31,23,0.12); text-align:center;">
          <h1 style="margin:0 0 12px; font-size:28px;">Authentication failed</h1>
          <p style="margin:0; line-height:1.5;">Close this tab and try the sign-in flow again from the desktop app.</p>
        </div>
      </body>
    </html>
  `;
}

function generateRandomColor(): string {
  return ACCOUNT_COLORS[Math.floor(Math.random() * ACCOUNT_COLORS.length)];
}

interface DatabaseStore {
  getAccounts(): StoredAccount[];
  saveAccounts(accounts: StoredAccount[]): void;
  clearUserData(homeAccountId: string): void;
}

interface SettingsStore {
  getSettings(): { activeAccountId?: string | null };
  updateSettings(patch: { activeAccountId: string | null }): void;
}

interface SessionSnapshot {
  accountVersions: ReadonlyMap<string, number>;
  globalSignOutVersion: number;
}

type SessionValidationResult =
  | { issue: AuthSessionIssue; accessToken: null }
  | { issue: null; accessToken: string };

type SessionValidationListener = (state: AuthState, removedHomeAccountId?: string) => void;

class MsalAuthService {
  private readonly config: AppConfig;
  private readonly pca: PublicClientApplication | null;
  private readonly tokenCache: SafeStorageTokenCache;
  private accounts: AccountInfo[] = [];
  private activeAccountId: string | null = null;
  private accountColors = new Map<string, string>();
  private lastSignedInAtMap = new Map<string, string>();
  private db: DatabaseStore | null = null;
  private settings: SettingsStore | null = null;
  private sessionIssues: AuthSessionIssue[] = [];
  private readonly sessionValidationListeners = new Set<SessionValidationListener>();
  private unverifiedAccounts = new Set<string>();
  private sessionValidations = new Map<string, Promise<SessionValidationResult>>();
  private accountVersions = new Map<string, number>();
  private globalSignOutVersion = 0;
  private pendingSignOuts = new Set<Promise<void>>();
  private pendingSignIns = new Set<Promise<AuthState>>();

  constructor(config: AppConfig, tokenCache: SafeStorageTokenCache) {
    this.config = config;
    this.tokenCache = tokenCache;

    if (hasConfiguredClientId(config.clientId)) {
      const msalConfig: Configuration = {
        auth: {
          clientId: config.clientId,
          authority: config.authority,
        },
        cache: {
          cachePlugin: tokenCache.createPlugin(),
        },
        system: {
          loggerOptions: {
            piiLoggingEnabled: false,
            logLevel: LogLevel.Warning,
            loggerCallback: (_level, _message) => undefined,
          },
        },
      };

      this.pca = new PublicClientApplication(msalConfig);
      return;
    }

    this.pca = null;
  }

  setDatabase(db: DatabaseStore): void {
    this.db = db;
  }

  setSettings(settings: SettingsStore): void {
    this.settings = settings;
  }

  async initialize(): Promise<void> {
    if (!this.pca) {
      return;
    }

    const msalAccounts = await this.pca.getAllAccounts();
    this.accounts = msalAccounts;

    if (this.db) {
      const storedAccounts = this.db.getAccounts();
      for (const stored of storedAccounts) {
        this.accountColors.set(stored.homeAccountId, stored.color);
        if (stored.lastSignedInAt) {
          this.lastSignedInAtMap.set(stored.homeAccountId, stored.lastSignedInAt);
        }
      }
    }

    if (this.settings) {
      const savedActiveId = this.settings.getSettings().activeAccountId;
      if (savedActiveId && this.accounts.some((a) => a.homeAccountId === savedActiveId)) {
        this.activeAccountId = savedActiveId;
      } else if (this.accounts.length > 0) {
        this.activeAccountId = this.accounts[0].homeAccountId;
      }
    } else if (this.accounts.length > 0) {
      this.activeAccountId = this.accounts[0].homeAccountId;
    }

    await Promise.all(this.accounts.map((account) => this.validateAccountSession(account)));
  }

  private validateAccountSession(account: AccountInfo): Promise<SessionValidationResult> {
    const pending = this.sessionValidations.get(account.homeAccountId);
    if (pending) {
      return pending;
    }
    const validation = this.checkAccountSession(account).finally(() => {
      if (this.sessionValidations.get(account.homeAccountId) === validation) {
        this.sessionValidations.delete(account.homeAccountId);
      }
    });
    this.sessionValidations.set(account.homeAccountId, validation);
    return validation;
  }

  private async checkAccountSession(account: AccountInfo): Promise<SessionValidationResult> {
    const version = this.getAccountVersion(account.homeAccountId);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let result: AuthenticationResult | null = null;
    try {
      result = await Promise.race([
        this.acquireSilentToken(account, true, version),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Microsoft 365 session validation timed out.")),
            SESSION_VALIDATION_TIMEOUT_MS,
          );
        }),
      ]);
      this.assertCurrentAccount(account.homeAccountId, version);
      validateSessionPermissions(result, this.config.graphScopes, account.homeAccountId);
    } catch (error) {
      this.assertCurrentAccount(account.homeAccountId, version);
      return {
        issue: await this.recordSessionFailure(account, classifySessionValidationError(error)),
        accessToken: null,
      };
    } finally {
      clearTimeout(timeout);
    }

    const wasUnverified = this.unverifiedAccounts.delete(account.homeAccountId);
    this.sessionIssues = this.sessionIssues.filter(
      (item) => item.homeAccountId !== account.homeAccountId,
    );
    if (wasUnverified) {
      this.notifySessionValidation();
    }
    return { issue: null, accessToken: result.accessToken };
  }

  onSessionValidation(listener: SessionValidationListener): () => void {
    this.sessionValidationListeners.add(listener);
    return () => {
      this.sessionValidationListeners.delete(listener);
    };
  }

  private notifySessionValidation(removedHomeAccountId?: string): void {
    const state = this.getAuthState();
    for (const listener of this.sessionValidationListeners) {
      listener(state, removedHomeAccountId);
    }
  }

  private getAccountVersion(homeAccountId: string): number {
    return this.accountVersions.get(homeAccountId) ?? 0;
  }

  private captureSessionSnapshot(): SessionSnapshot {
    return {
      accountVersions: new Map(this.accountVersions),
      globalSignOutVersion: this.globalSignOutVersion,
    };
  }

  private sessionChanged(account: AccountInfo | null, snapshot: SessionSnapshot): boolean {
    return (
      snapshot.globalSignOutVersion !== this.globalSignOutVersion ||
      (account !== null &&
        this.getAccountVersion(account.homeAccountId) !==
          (snapshot.accountVersions.get(account.homeAccountId) ?? 0))
    );
  }

  private async discardUnregisteredAccount(account: AccountInfo | null): Promise<void> {
    if (account && !this.accounts.some((item) => item.homeAccountId === account.homeAccountId)) {
      await this.removeAccountTokens(account);
    }
  }

  private async acquireSilentToken(
    account: AccountInfo,
    forceRefresh: boolean,
    version: number,
  ): Promise<AuthenticationResult | null> {
    try {
      return await this.getPca().acquireTokenSilent({
        account,
        scopes: this.config.graphScopes,
        forceRefresh,
      });
    } finally {
      if (
        this.getAccountVersion(account.homeAccountId) !== version &&
        !this.accounts.some((item) => item.homeAccountId === account.homeAccountId)
      ) {
        while (this.pendingSignIns.size > 0) {
          await Promise.allSettled(this.pendingSignIns);
        }
        await this.discardUnregisteredAccount(account);
      }
    }
  }

  private removeAccountTokens(account: AccountInfo): Promise<void> {
    const signOut = this.getPca()
      .signOut({ account })
      .catch(() => undefined)
      .finally(() => {
        this.pendingSignOuts.delete(signOut);
      });
    this.pendingSignOuts.add(signOut);
    return signOut;
  }

  private advanceAccountVersion(homeAccountId: string): void {
    this.accountVersions.set(homeAccountId, this.getAccountVersion(homeAccountId) + 1);
    this.sessionValidations.delete(homeAccountId);
  }

  private assertCurrentAccount(homeAccountId: string, version: number): void {
    if (
      this.getAccountVersion(homeAccountId) !== version ||
      !this.accounts.some((account) => account.homeAccountId === homeAccountId)
    ) {
      throw new Error("The Microsoft 365 session changed during the request. Try again.");
    }
  }

  createAccountSessionGuard(homeAccountId: string): () => void {
    const version = this.getAccountVersion(homeAccountId);
    this.assertCurrentAccount(homeAccountId, version);
    return () => this.assertCurrentAccount(homeAccountId, version);
  }

  private async recordSessionFailure(
    account: AccountInfo,
    failure: SessionValidationError,
  ): Promise<AuthSessionIssue> {
    const issue: AuthSessionIssue = {
      homeAccountId: account.homeAccountId,
      username: account.username,
      reason: failure.reason,
      missingPermissions: failure.missingPermissions,
    };
    const alreadyUnverified = this.unverifiedAccounts.has(account.homeAccountId);
    if (issue.reason === "validation_unavailable") {
      this.unverifiedAccounts.add(account.homeAccountId);
    } else {
      const signOut = this.signOut(account.homeAccountId);
      const version = this.getAccountVersion(account.homeAccountId);
      await signOut;
      if (this.getAccountVersion(account.homeAccountId) !== version) {
        throw new Error("The Microsoft 365 session changed during the request. Try again.");
      }
      this.db?.clearUserData(account.homeAccountId);
    }
    this.sessionIssues = this.sessionIssues.filter(
      (item) => item.homeAccountId !== account.homeAccountId,
    );
    this.sessionIssues.push(issue);
    if (issue.reason !== "validation_unavailable" || !alreadyUnverified) {
      this.notifySessionValidation(
        issue.reason === "validation_unavailable" ? undefined : account.homeAccountId,
      );
    }
    return issue;
  }

  private persistActiveAccountId(): void {
    if (this.settings) {
      this.settings.updateSettings({ activeAccountId: this.activeAccountId });
    }
  }

  private getOrAssignColor(homeAccountId: string): string {
    let color = this.accountColors.get(homeAccountId);
    if (!color) {
      color = generateRandomColor();
      this.accountColors.set(homeAccountId, color);
    }

    return color;
  }

  hasSession(): boolean {
    return (
      this.activeAccountId !== null &&
      this.accounts.some((a) => a.homeAccountId === this.activeAccountId)
    );
  }

  getAuthState(): AuthState {
    const sessionIssues =
      this.sessionIssues.length > 0 ? { sessionIssues: this.sessionIssues } : {};
    if (this.accounts.length === 0) {
      return { status: "signed_out", accounts: [], ...sessionIssues };
    }

    if (!this.activeAccountId) {
      return { status: "signed_out", accounts: this.buildAccountsList(), ...sessionIssues };
    }

    const activeAccount = this.accounts.find((a) => a.homeAccountId === this.activeAccountId);
    if (!activeAccount) {
      return { status: "signed_out", accounts: this.buildAccountsList(), ...sessionIssues };
    }

    return {
      status: "signed_in",
      account: {
        homeAccountId: activeAccount.homeAccountId,
        username: activeAccount.username,
        name: activeAccount.name ?? null,
        tenantId: activeAccount.tenantId ?? null,
        color: this.getOrAssignColor(activeAccount.homeAccountId),
      },
      accounts: this.buildAccountsList(),
      activeAccountId: this.activeAccountId,
      ...sessionIssues,
    };
  }

  private buildAccountsList(): StoredAccount[] {
    return this.accounts.map((account) => ({
      homeAccountId: account.homeAccountId,
      username: account.username,
      name: account.name ?? null,
      tenantId: account.tenantId ?? null,
      color: this.getOrAssignColor(account.homeAccountId),
      lastSignedInAt: this.lastSignedInAtMap.get(account.homeAccountId) ?? new Date().toISOString(),
    }));
  }

  private persistAccounts(): void {
    if (!this.db) {
      return;
    }

    const storedAccounts = this.buildAccountsList();
    this.db.saveAccounts(storedAccounts);
  }

  private upsertAccount(account: AccountInfo, setActive = true): void {
    const existingIndex = this.accounts.findIndex(
      (item) => item.homeAccountId === account.homeAccountId,
    );

    if (existingIndex !== -1) {
      this.accounts[existingIndex] = account;
    } else {
      this.accounts.push(account);
      this.lastSignedInAtMap.set(account.homeAccountId, new Date().toISOString());
    }

    this.getOrAssignColor(account.homeAccountId);
    if (setActive) {
      this.activeAccountId = account.homeAccountId;
      this.persistActiveAccountId();
    }
    this.persistAccounts();
  }

  signIn(mode: AuthSignInMode = "user"): Promise<AuthState> {
    const signIn = this.completeSignIn(mode).finally(() => {
      this.pendingSignIns.delete(signIn);
    });
    this.pendingSignIns.add(signIn);
    return signIn;
  }

  private async completeSignIn(mode: AuthSignInMode): Promise<AuthState> {
    const snapshot = this.captureSessionSnapshot();
    const result = await this.acquireInteractiveToken(mode, undefined, snapshot);
    if (this.sessionChanged(result.account, snapshot)) {
      await this.discardUnregisteredAccount(result.account);
      throw new Error("The Microsoft 365 session changed during the request. Try again.");
    }

    if (result.account) {
      this.advanceAccountVersion(result.account.homeAccountId);
      this.upsertAccount(result.account);
      this.unverifiedAccounts.delete(result.account.homeAccountId);
      this.sessionIssues = this.sessionIssues.filter(
        (item) => item.homeAccountId !== result.account?.homeAccountId,
      );
    }

    return this.getAuthState();
  }

  async signOut(homeAccountId?: string): Promise<void> {
    const targetAccountId = homeAccountId ?? this.activeAccountId;
    if (!targetAccountId) {
      return;
    }

    const account = this.accounts.find((a) => a.homeAccountId === targetAccountId);
    this.advanceAccountVersion(targetAccountId);
    this.accounts = this.accounts.filter((a) => a.homeAccountId !== targetAccountId);
    this.accountColors.delete(targetAccountId);
    this.lastSignedInAtMap.delete(targetAccountId);
    this.unverifiedAccounts.delete(targetAccountId);
    this.sessionIssues = this.sessionIssues.filter(
      (item) => item.homeAccountId !== targetAccountId,
    );

    if (this.activeAccountId === targetAccountId) {
      this.activeAccountId = this.accounts.length > 0 ? this.accounts[0].homeAccountId : null;
    }

    this.persistAccounts();
    this.persistActiveAccountId();
    if (account && this.pca) {
      await this.removeAccountTokens(account);
    }
  }

  async signOutAll(): Promise<void> {
    const accounts = [...this.accounts];
    this.globalSignOutVersion += 1;
    for (const account of accounts) {
      this.advanceAccountVersion(account.homeAccountId);
    }

    this.accounts = [];
    this.activeAccountId = null;
    this.accountColors.clear();
    this.lastSignedInAtMap.clear();
    this.unverifiedAccounts.clear();
    this.sessionIssues = [];
    this.persistAccounts();
    this.persistActiveAccountId();
    if (this.pca) {
      for (const account of accounts) {
        await this.removeAccountTokens(account);
      }
    }
  }

  async switchAccount(homeAccountId: string): Promise<AuthState> {
    const account = this.accounts.find((a) => a.homeAccountId === homeAccountId);
    if (!account) {
      throw new Error("Account not found");
    }

    this.activeAccountId = homeAccountId;
    this.persistAccounts();
    this.persistActiveAccountId();
    return this.getAuthState();
  }

  getActiveAccountId(): string | null {
    return this.activeAccountId;
  }

  getAccountIds(): string[] {
    return this.accounts.map((account) => account.homeAccountId);
  }

  getAccountUsername(homeAccountId: string): null | string {
    const account = this.accounts.find((item) => item.homeAccountId === homeAccountId);
    return account?.username ?? null;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    const account = this.ensureAccount();
    return this.acquireAccessToken(account, forceRefresh);
  }

  async getAccessTokenForAccount(homeAccountId: string, forceRefresh = false): Promise<string> {
    const account = this.ensureAccount(homeAccountId);
    return this.acquireAccessToken(account, forceRefresh);
  }

  private async acquireAccessToken(account: AccountInfo, forceRefresh = false): Promise<string> {
    const version = this.getAccountVersion(account.homeAccountId);
    if (this.unverifiedAccounts.has(account.homeAccountId)) {
      const validation = await this.validateAccountSession(account);
      if (validation.issue) {
        throw new Error(`Unable to validate the Microsoft 365 session for ${account.username}.`);
      }
      this.assertCurrentAccount(account.homeAccountId, version);
      return validation.accessToken;
    }

    let result: AuthenticationResult | null;
    try {
      result = await this.acquireSilentToken(account, forceRefresh, version);
    } catch {
      this.assertCurrentAccount(account.homeAccountId, version);
      const interactive = await this.acquireInteractiveToken("user", account);
      this.assertCurrentAccount(account.homeAccountId, version);
      if (interactive.account) {
        if (interactive.account.homeAccountId !== account.homeAccountId) {
          throw new Error(`Unable to refresh the Microsoft 365 session for ${account.username}.`);
        }

        this.upsertAccount(
          interactive.account,
          interactive.account.homeAccountId === this.activeAccountId,
        );
      }
      if (interactive.accessToken) {
        return interactive.accessToken;
      }
      throw new Error("Unable to acquire an access token for Microsoft Graph.");
    }

    this.assertCurrentAccount(account.homeAccountId, version);
    try {
      validateSessionPermissions(result, this.config.graphScopes, account.homeAccountId);
    } catch (error) {
      await this.recordSessionFailure(account, classifySessionValidationError(error));
      throw error;
    }
    return result.accessToken;
  }

  private ensureAccount(homeAccountId?: string): AccountInfo {
    const targetAccountId = homeAccountId ?? this.activeAccountId;
    if (targetAccountId) {
      const account = this.accounts.find((a) => a.homeAccountId === targetAccountId);
      if (account) {
        return account;
      }
    }

    throw new Error("Sign in with Exchange 365 before syncing calendars.");
  }

  private async acquireInteractiveToken(
    mode: AuthSignInMode = "user",
    expectedAccount?: AccountInfo,
    snapshot = this.captureSessionSnapshot(),
  ): Promise<AuthenticationResult> {
    try {
      await Promise.all(this.pendingSignOuts);
      if (this.sessionChanged(expectedAccount ?? null, snapshot)) {
        throw new Error("The Microsoft 365 session changed during the request. Try again.");
      }
      const result = await this.getPca().acquireTokenInteractive({
        loginHint: expectedAccount?.username,
        scopes: this.config.graphScopes,
        prompt: getSignInPrompt(mode),
        successTemplate: buildSuccessTemplate(),
        errorTemplate: buildErrorTemplate(),
        openBrowser: async (url) => {
          await shell.openExternal(url);
        },
      });
      if (this.sessionChanged(result.account, snapshot)) {
        await this.discardUnregisteredAccount(result.account);
        throw new Error("The Microsoft 365 session changed during the request. Try again.");
      }
      if (expectedAccount && result.account?.homeAccountId !== expectedAccount.homeAccountId) {
        await this.discardUnregisteredAccount(result.account);
        throw new Error(
          `Unable to refresh the Microsoft 365 session for ${expectedAccount.username}.`,
        );
      }
      try {
        validateSessionPermissions(
          result,
          this.config.graphScopes,
          result.account?.homeAccountId ?? "",
        );
      } catch (error) {
        if (result.account) {
          if (this.accounts.some((item) => item.homeAccountId === result.account?.homeAccountId)) {
            await this.recordSessionFailure(result.account, classifySessionValidationError(error));
          } else {
            await this.removeAccountTokens(result.account);
          }
        }
        throw error;
      }
      return result;
    } catch (error) {
      throw normalizeMicrosoftSignInError(error);
    }
  }

  private getPca(): PublicClientApplication {
    if (!this.pca) {
      throw new Error(EXCHANGE365_CLIENT_ID_NOT_CONFIGURED_MESSAGE);
    }

    return this.pca;
  }
}

export default MsalAuthService;
