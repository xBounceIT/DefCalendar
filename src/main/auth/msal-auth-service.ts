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
  private accountColors: Map<string, string> = new Map();
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
    if (!this.activeAccountId || this.accounts.length === 0) {
      return { status: "signed_out", accounts: [] };
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
      lastSignedInAt: new Date().toISOString(),
    }));
  }

  private persistAccounts(): void {
    if (!this.db) return;
    const storedAccounts = this.buildAccountsList();
    this.db.saveAccounts(storedAccounts);
  }

  async signIn(mode: AuthSignInMode = "user"): Promise<AuthState> {
    const result = await this.acquireInteractiveToken(mode);

    if (result.account) {
      const existingIndex = this.accounts.findIndex(
        (a) => a.homeAccountId === result.account!.homeAccountId,
      );

      if (existingIndex >= 0) {
        this.accounts[existingIndex] = result.account;
      } else {
        this.accounts.push(result.account);
        if (!this.accountColors.has(result.account.homeAccountId)) {
          this.accountColors.set(result.account.homeAccountId, generateRandomColor());
        }
      }

      this.activeAccountId = result.account.homeAccountId;
      this.persistAccounts();
      this.persistActiveAccountId();
    }

    return this.getAuthState();
  }

  async signOut(homeAccountId?: string): Promise<void> {
    const targetAccountId = homeAccountId ?? this.activeAccountId;
    if (!targetAccountId) return;

    const account = this.accounts.find((a) => a.homeAccountId === targetAccountId);
    if (account && this.pca) {
      await this.pca.signOut({ account });
    }

    this.accounts = this.accounts.filter((a) => a.homeAccountId !== targetAccountId);
    this.accountColors.delete(targetAccountId);

    if (this.activeAccountId === targetAccountId) {
      this.activeAccountId = this.accounts.length > 0 ? this.accounts[0].homeAccountId : null;
    }

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

  async getAccessToken(forceRefresh = false): Promise<string> {
    const account = await this.ensureAccount();
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
      const interactive = await this.acquireInteractiveToken();
      if (interactive.account) {
        const existingIndex = this.accounts.findIndex(
          (a) => a.homeAccountId === interactive.account!.homeAccountId,
        );
        if (existingIndex >= 0) {
          this.accounts[existingIndex] = interactive.account;
        } else {
          this.accounts.push(interactive.account);
        }
        this.activeAccountId = interactive.account.homeAccountId;
        this.persistAccounts();
      }
      if (interactive.accessToken) {
        return interactive.accessToken;
      }
    }

    throw new Error("Unable to acquire an access token for Microsoft Graph.");
  }

  private async ensureAccount(): Promise<AccountInfo> {
    if (this.activeAccountId) {
      const account = this.accounts.find((a) => a.homeAccountId === this.activeAccountId);
      if (account) {
        return account;
      }
    }

    const msalAccounts = await this.getPca().getAllAccounts();
    if (!msalAccounts.length) {
      throw new Error("Sign in with Exchange 365 before syncing calendars.");
    }

    this.accounts = msalAccounts;
    const account = msalAccounts[0];
    this.activeAccountId = account.homeAccountId;
    if (!this.accountColors.has(account.homeAccountId)) {
      this.accountColors.set(account.homeAccountId, generateRandomColor());
    }
    this.persistAccounts();
    return account;
  }

  private async acquireInteractiveToken(
    mode: AuthSignInMode = "user",
  ): Promise<AuthenticationResult> {
    try {
      return await this.getPca().acquireTokenInteractive({
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
