// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import AuthScreen from "../src/renderer/src/components/auth-screen";
import enTranslations from "../src/renderer/src/i18n/locales/en.json";
import itTranslations from "../src/renderer/src/i18n/locales/it.json";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInstance } from "i18next";

afterEach(cleanup);

function createTestI18n(language: string) {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: {
      en: { translation: enTranslations },
      it: { translation: itTranslations },
    },
    lng: language,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return instance;
}

describe("i18n integration", () => {
  it("renders AuthScreen with English translations", () => {
    const testI18n = createTestI18n("en");

    render(
      <I18nextProvider i18n={testI18n}>
        <AuthScreen
          errorMessage={null}
          isPending={false}
          onAdminApproval={vi.fn()}
          onSignIn={vi.fn()}
          pendingMode="user"
          showAdminApprovalAction={false}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("Welcome to DefCalendar")).toBeInTheDocument();
    expect(screen.getByText("Your personal calendar companion.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync Microsoft 365" })).toBeInTheDocument();
  });

  it("renders AuthScreen with Italian translations", () => {
    const testI18n = createTestI18n("it");

    render(
      <I18nextProvider i18n={testI18n}>
        <AuthScreen
          errorMessage={null}
          isPending={false}
          onAdminApproval={vi.fn()}
          onSignIn={vi.fn()}
          pendingMode="user"
          showAdminApprovalAction={false}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("Benvenuto in DefCalendar")).toBeInTheDocument();
    expect(screen.getByText("Il tuo compagno di calendario personale.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sincronizza Microsoft 365" })).toBeInTheDocument();
  });

  it("switches language and updates UI correctly", async () => {
    const testI18n = createTestI18n("en");

    const { rerender } = render(
      <I18nextProvider i18n={testI18n}>
        <AuthScreen
          errorMessage={null}
          isPending={false}
          onAdminApproval={vi.fn()}
          onSignIn={vi.fn()}
          pendingMode="user"
          showAdminApprovalAction={false}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("Welcome to DefCalendar")).toBeInTheDocument();

    await testI18n.changeLanguage("it");

    rerender(
      <I18nextProvider i18n={testI18n}>
        <AuthScreen
          errorMessage={null}
          isPending={false}
          onAdminApproval={vi.fn()}
          onSignIn={vi.fn()}
          pendingMode="user"
          showAdminApprovalAction={false}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText("Benvenuto in DefCalendar")).toBeInTheDocument();
  });

  it("should not have console warnings about missing keys", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const testI18n = createTestI18n("en");

    render(
      <I18nextProvider i18n={testI18n}>
        <AuthScreen
          errorMessage={null}
          isPending={false}
          onAdminApproval={vi.fn()}
          onSignIn={vi.fn()}
          pendingMode="user"
          showAdminApprovalAction={false}
        />
      </I18nextProvider>,
    );

    const i18nWarnings = consoleSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === "string" &&
        (call[0].includes("i18next") || call[0].includes("missingKey")),
    );

    expect(i18nWarnings).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});
