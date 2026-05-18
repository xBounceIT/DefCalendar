// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import type { AppUpdateStatus } from "@shared/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdater } from "../src/renderer/src/hooks/use-updater";

const IDLE_STATUS: AppUpdateStatus = {
  checkedAt: null,
  currentVersion: "v0.5.0",
  downloadPercent: null,
  error: null,
  latestVersion: null,
  releaseNotes: null,
  state: "idle",
};

const AVAILABLE_STATUS: AppUpdateStatus = {
  ...IDLE_STATUS,
  latestVersion: "1.0.0",
  state: "available",
};

const DOWNLOADED_STATUS: AppUpdateStatus = {
  ...AVAILABLE_STATUS,
  downloadPercent: 100,
  state: "downloaded",
};

let getStatusMock: ReturnType<typeof vi.fn> = vi.fn();
let checkMock: ReturnType<typeof vi.fn> = vi.fn();
let downloadMock: ReturnType<typeof vi.fn> = vi.fn();
let installMock: ReturnType<typeof vi.fn> = vi.fn();
let onStatusMock: ReturnType<typeof vi.fn> = vi.fn();
let unsubscribeMock: ReturnType<typeof vi.fn> = vi.fn();
let lastStatusListener: ((status: AppUpdateStatus) => void) | null = null;

beforeEach(() => {
  lastStatusListener = null;
  unsubscribeMock = vi.fn();
  getStatusMock = vi.fn().mockResolvedValue(IDLE_STATUS);
  checkMock = vi.fn().mockResolvedValue(AVAILABLE_STATUS);
  downloadMock = vi.fn().mockResolvedValue(DOWNLOADED_STATUS);
  installMock = vi.fn().mockResolvedValue(undefined);
  onStatusMock = vi.fn((listener: (status: AppUpdateStatus) => void) => {
    lastStatusListener = listener;
    return unsubscribeMock;
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

function renderUseUpdater() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useUpdater(), { wrapper });
}

describe(useUpdater, () => {
  it("calls getStatus on mount and exposes the result", async () => {
    const { result } = renderUseUpdater();

    await waitFor(() => {
      expect(result.current.status).toStrictEqual(IDLE_STATUS);
    });
    expect(getStatusMock).toHaveBeenCalledOnce();
    expect(result.current.statusError).toBeNull();
  });

  it("registers an onStatus listener and updates state when it fires", async () => {
    const { result } = renderUseUpdater();
    await waitFor(() => expect(onStatusMock).toHaveBeenCalledOnce());

    act(() => {
      lastStatusListener?.(AVAILABLE_STATUS);
    });

    await waitFor(() => {
      expect(result.current.status).toStrictEqual(AVAILABLE_STATUS);
    });
  });

  it("check() fires the mutation and updates query cache on success", async () => {
    const { result } = renderUseUpdater();
    await waitFor(() => expect(result.current.status).toStrictEqual(IDLE_STATUS));

    act(() => {
      result.current.check();
    });

    await waitFor(() => {
      expect(checkMock).toHaveBeenCalledOnce();
      expect(result.current.status).toStrictEqual(AVAILABLE_STATUS);
    });
  });

  it("download() fires the mutation and updates query cache on success", async () => {
    const { result } = renderUseUpdater();
    await waitFor(() => expect(result.current.status).toStrictEqual(IDLE_STATUS));

    act(() => {
      result.current.download();
    });

    await waitFor(() => {
      expect(downloadMock).toHaveBeenCalledOnce();
      expect(result.current.status).toStrictEqual(DOWNLOADED_STATUS);
    });
  });

  it("install() invokes the IPC bridge", async () => {
    const { result } = renderUseUpdater();
    await waitFor(() => expect(result.current.status).toStrictEqual(IDLE_STATUS));

    act(() => {
      result.current.install();
    });

    expect(installMock).toHaveBeenCalledOnce();
  });

  it("reflects mutation pending state via isChecking and isDownloading", async () => {
    let resolveCheck: (status: AppUpdateStatus) => void = () => {};
    checkMock.mockReturnValue(
      new Promise<AppUpdateStatus>((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const { result } = renderUseUpdater();
    await waitFor(() => expect(result.current.status).toStrictEqual(IDLE_STATUS));

    act(() => {
      result.current.check();
    });

    await waitFor(() => expect(result.current.isChecking).toBeTruthy());

    await act(async () => {
      resolveCheck(AVAILABLE_STATUS);
    });

    await waitFor(() => expect(result.current.isChecking).toBeFalsy());
  });

  it("unsubscribes the onStatus listener on unmount", async () => {
    const { unmount } = renderUseUpdater();
    await waitFor(() => expect(onStatusMock).toHaveBeenCalledOnce());

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledOnce();
  });
});
