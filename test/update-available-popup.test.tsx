// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { AppUpdateStatus } from "@shared/schemas";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestI18n } from "./setup-i18n";
import UpdateAvailablePopup from "../src/renderer/src/components/update-available-popup";

const BASE_STATUS: AppUpdateStatus = {
  checkedAt: null,
  currentVersion: "v0.5.0",
  downloadPercent: null,
  error: null,
  latestVersion: null,
  releaseNotes: null,
  state: "idle",
};

let getStatusMock: ReturnType<typeof vi.fn> = vi.fn();
let checkMock: ReturnType<typeof vi.fn> = vi.fn();
let downloadMock: ReturnType<typeof vi.fn> = vi.fn();
let installMock: ReturnType<typeof vi.fn> = vi.fn();
let onStatusMock: ReturnType<typeof vi.fn> = vi.fn();
let lastListener: ((status: AppUpdateStatus) => void) | null = null;

beforeEach(() => {
  lastListener = null;
  getStatusMock = vi.fn().mockResolvedValue(BASE_STATUS);
  checkMock = vi.fn().mockResolvedValue(BASE_STATUS);
  downloadMock = vi.fn().mockResolvedValue({
    ...BASE_STATUS,
    state: "downloaded",
    downloadPercent: 100,
    latestVersion: "1.0.0",
  });
  installMock = vi.fn().mockResolvedValue(undefined);
  onStatusMock = vi.fn((listener: (status: AppUpdateStatus) => void) => {
    lastListener = listener;
    return () => {};
  });

  (globalThis as unknown as { calendarApi: unknown }).calendarApi = {
    updates: {
      getStatus: getStatusMock,
      check: checkMock,
      download: downloadMock,
      install: installMock,
      onStatus: onStatusMock,
    },
  };
});

afterEach(() => {
  cleanup();
  delete (globalThis as unknown as { calendarApi?: unknown }).calendarApi;
});

function renderPopup(initialStatus: AppUpdateStatus = BASE_STATUS) {
  getStatusMock.mockResolvedValue(initialStatus);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createTestI18n()}>
        <UpdateAvailablePopup />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("updateAvailablePopup visibility", () => {
  it("renders nothing when status is idle", async () => {
    const { container } = renderPopup();
    await waitFor(() => expect(getStatusMock).toHaveBeenCalled());
    expect(container.querySelector(".update-popup")).toBeNull();
  });

  it("renders the popup when status state is 'available'", async () => {
    renderPopup({ ...BASE_STATUS, state: "available", latestVersion: "1.0.0" });
    await waitFor(() => {
      expect(document.querySelector(".update-popup")).not.toBeNull();
    });
    expect(screen.getByText(/Download/i)).toBeInTheDocument();
  });

  it("displays the normalized release version with 'v' prefix", async () => {
    renderPopup({ ...BASE_STATUS, state: "available", latestVersion: "1.2.3" });
    await waitFor(() => {
      expect(document.body.textContent).toContain("v1.2.3");
    });
  });

  it("disappears after 'Remind me later' is clicked", async () => {
    renderPopup({ ...BASE_STATUS, state: "available", latestVersion: "1.0.0" });
    await waitFor(() => expect(document.querySelector(".update-popup")).not.toBeNull());

    const remindLater = screen.getByText(/Later/i);
    fireEvent.click(remindLater);

    expect(document.querySelector(".update-popup")).toBeNull();
  });
});

describe("updateAvailablePopup actions", () => {
  it("clicking the primary button calls download()", async () => {
    renderPopup({ ...BASE_STATUS, state: "available", latestVersion: "1.0.0" });
    await waitFor(() => expect(document.querySelector(".update-popup")).not.toBeNull());

    const buttons = document.querySelectorAll(".update-popup__button--primary");
    fireEvent.click(buttons[0]!);

    await waitFor(() => expect(downloadMock).toHaveBeenCalledOnce());
  });

  it("auto-installs once status transitions to downloaded after a download", async () => {
    renderPopup({ ...BASE_STATUS, state: "available", latestVersion: "1.0.0" });
    await waitFor(() => expect(document.querySelector(".update-popup")).not.toBeNull());

    const primary = document.querySelector(".update-popup__button--primary")!;
    fireEvent.click(primary);

    await waitFor(() => expect(downloadMock).toHaveBeenCalledOnce());

    act(() => {
      lastListener?.({
        ...BASE_STATUS,
        state: "downloaded",
        downloadPercent: 100,
        latestVersion: "1.0.0",
      });
    });

    await waitFor(() => expect(installMock).toHaveBeenCalledOnce());
  });

  it("does not call install when state is 'downloaded' but no download was initiated", async () => {
    renderPopup({
      ...BASE_STATUS,
      state: "downloaded",
      downloadPercent: 100,
      latestVersion: "1.0.0",
    });
    await waitFor(() => expect(getStatusMock).toHaveBeenCalled());

    expect(installMock).not.toHaveBeenCalled();
    expect(document.querySelector(".update-popup")).toBeNull();
  });
});
