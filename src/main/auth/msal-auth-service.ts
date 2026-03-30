import type { AccountInfo, AuthenticationResult, Configuration } from "@azure/msal-node";
import { LogLevel, PublicClientApplication } from "@main/auth/msal-runtime";
import { getSignInPrompt, normalizeMicrosoftSignInError } from "@main/auth/auth-sign-in";
import { hasConfiguredClientId } from "@main/auth/app-registration";
import type { AppConfig } from "@main/config";
import { shell } from "electron";
import type { AuthSignInMode, AuthState, StoredAccount } from "@shared/schemas";
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
}

interface SettingsStore {
  getSettings(): { activeAccountId?: string | null };
  updateSettings(patch: { activeAccountId: string | null }): void;
}

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
    if (this.accounts.length === 0) {
      return { status: "signed_out", accounts: [] };
    }

    if (!this.activeAccountId) {
      return { status: "signed_out", accounts: this.buildAccountsList() };
    }

    const activeAccount = this.accounts.find((a) => a.homeAccountId === this.activeAccountId);
    if (!activeAccount) {
      return { status: "signed_out", accounts: this.buildAccountsList() };
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

  async signIn(mode: AuthSignInMode = "user"): Promise<AuthState> {
    const result = await this.acquireInteractiveToken(mode);

    if (result.account) {
      this.upsertAccount(result.account);
    }

    return this.getAuthState();
  }

  async signOut(homeAccountId?: string): Promise<void> {
    const targetAccountId = homeAccountId ?? this.activeAccountId;
    if (!targetAccountId) {
      return;
    }

    const account = this.accounts.find((a) => a.homeAccountId === targetAccountId);
    if (account && this.pca) {
      await this.pca.signOut({ account });
    }

    this.accounts = this.accounts.filter((a) => a.homeAccountId !== targetAccountId);
    this.accountColors.delete(targetAccountId);
    this.lastSignedInAtMap.delete(targetAccountId);

    if (this.activeAccountId === targetAccountId) {
      this.activeAccountId = this.accounts.length > 0 ? this.accounts[0].homeAccountId : null;
    }

    this.persistAccounts();
    this.persistActiveAccountId();
  }

  async signOutAll(): Promise<void> {
    const accounts = [...this.accounts];
    if (this.pca) {
      for (const account of accounts) {
        await this.pca.signOut({ account });
      }
    }

    this.accounts = [];
    this.activeAccountId = null;
    this.accountColors.clear();
    this.lastSignedInAtMap.clear();
    this.persistAccounts();
    this.persistActiveAccountId();
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
    const account = await this.ensureAccount();
    return this.acquireAccessToken(account, forceRefresh);
  }

  async getAccessTokenForAccount(homeAccountId: string, forceRefresh = false): Promise<string> {
    const account = await this.ensureAccount(homeAccountId);
    return this.acquireAccessToken(account, forceRefresh);
  }

  private async acquireAccessToken(account: AccountInfo, forceRefresh = false): Promise<string> {
    const pca = this.getPca();

    try {
      const result = await pca.acquireTokenSilent({
        account,
        scopes: this.config.graphScopes,
        forceRefresh,
      });

      if (result?.accessToken) {
        return result.accessToken;
      }
    } catch {
      const interactive = await this.acquireInteractiveToken("user", account.username);
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
    }

    throw new Error("Unable to acquire an access token for Microsoft Graph.");
  }

  private async ensureAccount(homeAccountId?: string): Promise<AccountInfo> {
    const targetAccountId = homeAccountId ?? this.activeAccountId;
    if (targetAccountId) {
      const account = this.accounts.find((a) => a.homeAccountId === targetAccountId);
      if (account) {
        return account;
      }
    }

    const msalAccounts = await this.getPca().getAllAccounts();
    if (!msalAccounts.length) {
      throw new Error("Sign in with Exchange 365 before syncing calendars.");
    }

    this.accounts = msalAccounts;
    for (const account of msalAccounts) {
      this.getOrAssignColor(account.homeAccountId);
    }

    const account = targetAccountId
      ? (msalAccounts.find((item) => item.homeAccountId === targetAccountId) ?? null)
      : (msalAccounts[0] ?? null);

    if (!account) {
      throw new Error(
        targetAccountId
          ? `Account ${targetAccountId} not found. Please sign in again.`
          : "Sign in with Exchange 365 before syncing calendars.",
      );
    }

    if (!homeAccountId) {
      this.activeAccountId = account.homeAccountId;
      this.persistActiveAccountId();
    }

    this.persistAccounts();
    return account;
  }

  private async acquireInteractiveToken(
    mode: AuthSignInMode = "user",
    loginHint?: string,
  ): Promise<AuthenticationResult> {
    try {
      return await this.getPca().acquireTokenInteractive({
        loginHint,
        scopes: this.config.graphScopes,
        prompt: getSignInPrompt(mode),
        successTemplate: buildSuccessTemplate(),
        errorTemplate: buildErrorTemplate(),
        openBrowser: async (url) => {
          await shell.openExternal(url);
        },
      });
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
