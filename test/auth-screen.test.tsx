// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import AuthScreen from "../src/renderer/src/components/auth-screen";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import { EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE } from "../src/shared/exchange-auth";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { createInstance } from "i18next";
import { describe, expect, it, vi } from "vitest";

function renderAuthScreen(props: React.ComponentProps<typeof AuthScreen>) {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: enTranslations } },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <AuthScreen {...props} />
    </I18nextProvider>,
  );
}

describe("auth screen", () => {
  it("renders the primary Exchange button and welcome message", () => {
    renderAuthScreen({
      errorMessage: null,
      isPending: false,
      onAdminApproval: vi.fn(),
      onSignIn: vi.fn(),
      pendingMode: "user",
      showAdminApprovalAction: false,
    });

    expect(screen.getByRole("button", { name: "Sync Microsoft 365" })).not.toBeNull();
    expect(screen.getByText(/Welcome to DefCalendar/i)).not.toBeNull();
    expect(screen.getByText(/Your personal calendar companion\./i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /admin approval/i })).toBeNull();
  });

  it("renders the admin approval retry when the tenant requires approval", () => {
    const onAdminApproval = vi.fn();

    renderAuthScreen({
      errorMessage: EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE,
      isPending: false,
      onAdminApproval,
      onSignIn: vi.fn(),
      pendingMode: "user",
      showAdminApprovalAction: true,
    });

    const approvalButton = screen.getByRole("button", { name: "Retry with Admin Approval" });
    fireEvent.click(approvalButton);

    expect(onAdminApproval).toHaveBeenCalledTimes(1);
  });

  it("shows a pending admin approval label while the retry is running", () => {
    renderAuthScreen({
      errorMessage: EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE,
      isPending: true,
      onAdminApproval: vi.fn(),
      onSignIn: vi.fn(),
      pendingMode: "admin_consent",
      showAdminApprovalAction: true,
    });

    expect(screen.getByRole("button", { name: "Requesting Approval…" })).not.toBeNull();
  });
});
