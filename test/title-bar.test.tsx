// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestI18n } from "./setup-i18n";
import TitleBar from "../src/renderer/src/components/title-bar";

let minimizeMock: ReturnType<typeof vi.fn> = vi.fn();
let maximizeMock: ReturnType<typeof vi.fn> = vi.fn();
let closeMock: ReturnType<typeof vi.fn> = vi.fn();
let isMaximizedMock: ReturnType<typeof vi.fn> = vi.fn();

beforeEach(() => {
  minimizeMock = vi.fn().mockResolvedValue(undefined);
  maximizeMock = vi.fn().mockResolvedValue(undefined);
  closeMock = vi.fn().mockResolvedValue(undefined);
  isMaximizedMock = vi.fn().mockResolvedValue(false);

  (globalThis as unknown as { calendarApi: unknown }).calendarApi = {
    window: {
      minimize: minimizeMock,
      maximize: maximizeMock,
      close: closeMock,
      isMaximized: isMaximizedMock,
    },
  };
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { calendarApi?: unknown }).calendarApi;
});

function renderTitleBar() {
  return render(
    <I18nextProvider i18n={createTestI18n()}>
      <TitleBar />
    </I18nextProvider>,
  );
}

describe(TitleBar, () => {
  it("renders the brand and three control buttons", () => {
    renderTitleBar();
    expect(screen.getByText("DefCalendar")).toBeInTheDocument();
    expect(screen.getByTitle("Minimize")).toBeInTheDocument();
    expect(screen.getByTitle("Maximize")).toBeInTheDocument();
    expect(screen.getByTitle("Close")).toBeInTheDocument();
  });

  it("checks maximized state on mount", async () => {
    renderTitleBar();
    await waitFor(() => expect(isMaximizedMock).toHaveBeenCalled());
  });

  it("invokes window.minimize when minimize button is clicked", () => {
    renderTitleBar();
    fireEvent.click(screen.getByTitle("Minimize"));
    expect(minimizeMock).toHaveBeenCalledOnce();
  });

  it("invokes window.close when close button is clicked", () => {
    renderTitleBar();
    fireEvent.click(screen.getByTitle("Close"));
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("invokes window.maximize and re-checks state when maximize is clicked", async () => {
    renderTitleBar();
    fireEvent.click(screen.getByTitle("Maximize"));

    await waitFor(() => {
      expect(maximizeMock).toHaveBeenCalledOnce();
    });
    // The handler also calls isMaximized after maximize
    await waitFor(() => {
      expect(isMaximizedMock).toHaveBeenCalledTimes(2);
    });
  });

  it("shows Restore label after window becomes maximized", async () => {
    isMaximizedMock.mockResolvedValue(true);
    renderTitleBar();
    await waitFor(() => {
      expect(screen.getByTitle("Restore")).toBeInTheDocument();
    });
  });

  it("removes the resize listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderTitleBar();
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    removeSpy.mockRestore();
  });
});
