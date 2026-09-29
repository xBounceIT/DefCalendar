import type { AuthenticationResult } from "@azure/msal-node";
import { InteractionRequiredAuthError } from "@main/auth/msal-runtime";
import type { AuthSessionIssue } from "@shared/schemas";

const IDENTITY_SCOPES = new Set(["openid", "profile", "email", "offline_access"]);

function normalizeScope(scope: string): string {
  return scope
    .trim()
    .toLowerCase()
    .replace(/^https:\/\/graph\.microsoft\.com\//, "");
}

class SessionValidationError extends Error {
  constructor(
    readonly reason: AuthSessionIssue["reason"],
    readonly missingPermissions: string[] = [],
  ) {
    super(
      reason === "missing_permissions"
        ? `Microsoft 365 access is missing required permissions: ${missingPermissions.join(", ")}. Sign in again and approve all requested permissions.`
        : "The Microsoft 365 session must be renewed. Sign in again.",
    );
  }
}

function validateSessionPermissions(
  result: AuthenticationResult | null,
  requestedScopes: string[],
  homeAccountId: string,
): asserts result is AuthenticationResult {
  if (!result?.accessToken || result.account?.homeAccountId !== homeAccountId) {
    throw new SessionValidationError("session_expired");
  }

  const grantedScopes = new Set(result.scopes.map(normalizeScope));
  const missingPermissions = requestedScopes.filter((scope) => {
    const normalized = normalizeScope(scope);
    return !IDENTITY_SCOPES.has(normalized) && !grantedScopes.has(normalized);
  });

  if (missingPermissions.length > 0) {
    throw new SessionValidationError("missing_permissions", missingPermissions);
  }
}

function classifySessionValidationError(error: unknown): SessionValidationError {
  if (error instanceof SessionValidationError) {
    return error;
  }

  const code =
    typeof error === "object" && error !== null && "errorCode" in error ? error.errorCode : null;
  const subError =
    typeof error === "object" && error !== null && "subError" in error ? error.subError : null;
  const message = error instanceof Error ? error.message : "";

  if (
    code === "consent_required" ||
    subError === "consent_required" ||
    /AADSTS(?:65001|90094|900941)\b/i.test(message)
  ) {
    return new SessionValidationError("consent_required");
  }

  if (
    error instanceof InteractionRequiredAuthError ||
    code === "invalid_grant" ||
    code === "no_tokens_found" ||
    code === "interaction_required" ||
    code === "login_required"
  ) {
    return new SessionValidationError("session_expired");
  }

  return new SessionValidationError("validation_unavailable");
}

export { validateSessionPermissions, classifySessionValidationError, SessionValidationError };
