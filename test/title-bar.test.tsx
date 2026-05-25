// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createTestI18n } from "./setup-i18n";
import TitleBar from "../src/renderer/src/components/title-bar";

afterEach(() => {
  cleanup();
});

function renderTitleBar() {
  return render(
    <I18nextProvider i18n={createTestI18n()}>
      <TitleBar />
    </I18nextProvider>,
  );
}

describe(TitleBar, () => {
  it("renders the app brand", () => {
    renderTitleBar();
    expect(screen.getByText("DefCalendar")).toBeInTheDocument();
  });
});
