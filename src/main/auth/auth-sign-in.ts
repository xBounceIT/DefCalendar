import { PromptValue } from "@main/auth/msal-runtime";
import {
  EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE,
  EXCHANGE365_REPLY_URL_NOT_CONFIGURED_MESSAGE,
} from "@shared/exchange-auth";
import type { AuthSignInMode } from "@shared/schemas";

const ADMIN_APPROVAL_ERROR_FRAGMENTS = [
  "aadsts65001",
  "aadsts90094",
  "aadsts900941",
  "admin approval",
  "admin consent",
  "consent_required",
  "has not consented",
  "has not been verified",
  "needs permission to access resources in your organization",
  "permission requested by the app",
  "publisher has not been verified",
  "user or administrator has not consented",
];

const REPLY_URL_ERROR_FRAGMENTS = [
  "aadsts500113",
  "no reply address is registered for the application",
  "reply url",
  "reply address",
];

function getSignInPrompt(mode: AuthSignInMode): string {
  if (mode === "admin_consent") {
    return PromptValue.CONSENT;
  }

  return PromptValue.SELECT_ACCOUNT;
}

function normalizeMicrosoftSignInError(error: unknown): Error {
  const message = toErrorMessage(error);
  if (message && requiresReplyUrlConfiguration(message)) {
    return new Error(EXCHANGE365_REPLY_URL_NOT_CONFIGURED_MESSAGE);
  }

  if (message && requiresAdminApproval(message)) {
    return new Error(EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE);
  }

  if (error instanceof Error) {
    return error;
  }

  if (message) {
    return new Error(message);
  }

  return new Error("Authentication with Exchange 365 failed.");
}

function requiresAdminApproval(message: string): boolean {
  const normalized = message.toLowerCase();
  return ADMIN_APPROVAL_ERROR_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function requiresReplyUrlConfiguration(message: string): boolean {
  const normalized = message.toLowerCase();
  return REPLY_URL_ERROR_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function toErrorMessage(value: unknown): null | string {
  if (!value) {
    return null;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

export { getSignInPrompt, normalizeMicrosoftSignInError };
