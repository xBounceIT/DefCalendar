import type { AccountInfo, AuthenticationResult, Configuration } from "@azure/msal-node";
import { LogLevel, PublicClientApplication } from "@main/auth/msal-runtime";
import { getSignInPrompt, normalizeMicrosoftSignInError } from "@main/auth/auth-sign-in";
import { hasConfiguredClientId } from "@main/auth/app-registration";
import type { AppConfig } from "@main/config";
import { shell } from "electron";
import type { AuthSignInMode, AuthState } from "@shared/schemas";
import type SafeStorageTokenCache from "@main/auth/cache-plugin";
import { EXCHANGE365_CLIENT_ID_NOT_CONFIGURED_MESSAGE } from "@shared/exchange-auth";

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

class MsalAuthService {
  private readonly config: AppConfig;
  private readonly pca: PublicClientApplication | null;
  private readonly tokenCache: SafeStorageTokenCache;
  private account: AccountInfo | null = null;

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

  async initialize(): Promise<void> {
    if (!this.pca) {
      return;
    }

    const accounts = await this.pca.getAllAccounts();
    this.account = accounts[0] ?? null;
  }

  hasSession(): boolean {
    return this.account !== null;
  }

  getAuthState(): AuthState {
    if (!this.account) {
      return { status: "signed_out" };
    }

    return {
      status: "signed_in",
      account: {
        homeAccountId: this.account.homeAccountId,
        username: this.account.username,
        name: this.account.name ?? null,
        tenantId: this.account.tenantId ?? null,
      },
    };
  }

  async signIn(mode: AuthSignInMode = "user"): Promise<AuthState> {
    const result = await this.acquireInteractiveToken(mode);
    this.account = result.account ?? this.account;
    return this.getAuthState();
  }

  async signOut(): Promise<void> {
    if (this.account && this.pca) {
      await this.pca.signOut({ account: this.account });
    }

    this.account = null;
    this.tokenCache.clear();
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
      this.account = interactive.account ?? this.account;
      if (interactive.accessToken) {
        return interactive.accessToken;
      }
    }

    throw new Error("Unable to acquire an access token for Microsoft Graph.");
  }

  private async ensureAccount(): Promise<AccountInfo> {
    if (this.account) {
      return this.account;
    }

    const accounts = await this.getPca().getAllAccounts();
    if (!accounts.length) {
      throw new Error("Sign in with Exchange 365 before syncing calendars.");
    }

    const [account] = accounts;
    this.account = account;
    return this.account;
  }

  private async acquireInteractiveToken(
    mode: AuthSignInMode = "user",
  ): Promise<AuthenticationResult> {
    try {
      // MSAL Node uses a loopback localhost redirect for system-browser auth.
      // Register http://localhost in Entra instead of trying to pass a redirect URI here.
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
