import { beforeEach, describe, expect, it, vi } from "vitest";
import UpdateService from "../src/main/update/update-service";

const { isPackagedRef, getVersionMock } = vi.hoisted(() => ({
  getVersionMock: vi.fn().mockReturnValue("0.5.0"),
  isPackagedRef: { value: true },
}));

vi.mock(import("@main/electron-runtime"), () => ({
  app: {
    get isPackaged() {
      return isPackagedRef.value;
    },
    getVersion: getVersionMock,
  },
}));

const autoUpdaterMock = vi.hoisted(() => ({
  allowPrerelease: false,
  autoDownload: true,
  autoInstallOnAppQuit: true,
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  on: vi.fn(),
  quitAndInstall: vi.fn(),
}));

vi.mock(import("electron-updater"), () => ({
  autoUpdater: autoUpdaterMock,
}));

type Listener = (arg: unknown) => void;

function getHandler(event: string): Listener {
  const call = autoUpdaterMock.on.mock.calls.find(([name]) => name === event);
  if (!call) {
    throw new Error(`No handler registered for event: ${event}`);
  }
  return call[1] as Listener;
}

beforeEach(() => {
  isPackagedRef.value = true;
  autoUpdaterMock.allowPrerelease = false;
  autoUpdaterMock.autoDownload = true;
  autoUpdaterMock.autoInstallOnAppQuit = true;
  autoUpdaterMock.checkForUpdates.mockReset();
  autoUpdaterMock.downloadUpdate.mockReset();
  autoUpdaterMock.on.mockReset();
  autoUpdaterMock.quitAndInstall.mockReset();
});

describe("updateService construction", () => {
  it("stays unsupported and registers no listeners when not packaged", async () => {
    isPackagedRef.value = false;
    const service = new UpdateService();

    expect(service.getStatus().state).toBe("unsupported");
    expect(service.getStatus().currentVersion).toBe("v0.5.0");
    expect(autoUpdaterMock.on).not.toHaveBeenCalled();
  });

  it("transitions to idle and registers all autoUpdater listeners when packaged", async () => {
    const service = new UpdateService();

    expect(service.getStatus().state).toBe("idle");
    expect(autoUpdaterMock.autoDownload).toBeFalsy();
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBeFalsy();
    const events = autoUpdaterMock.on.mock.calls.map(([name]) => name);
    expect(events).toStrictEqual([
      "checking-for-update",
      "update-available",
      "update-not-available",
      "download-progress",
      "update-downloaded",
      "error",
    ]);
  });

  it("propagates the allowPrerelease flag to autoUpdater", () => {
    const service = new UpdateService(true);
    expect(autoUpdaterMock.allowPrerelease).toBeTruthy();
    expect(service.getStatus().state).toBe("idle");
  });
});

describe("updateService event handlers", () => {
  it("transitions through the full available → downloading → downloaded lifecycle", async () => {
    const service = new UpdateService();

    getHandler("checking-for-update")(undefined);
    expect(service.getStatus().state).toBe("checking");

    getHandler("update-available")({ version: "1.0.0", releaseNotes: "Highlights" });
    expect(service.getStatus().state).toBe("available");
    expect(service.getStatus().latestVersion).toBe("1.0.0");
    expect(service.getStatus().releaseNotes).toBe("Highlights");

    getHandler("download-progress")({ percent: 42.5 });
    expect(service.getStatus().state).toBe("downloading");
    expect(service.getStatus().downloadPercent).toBe(42.5);

    getHandler("update-downloaded")({ version: "1.0.0", releaseNotes: null });
    expect(service.getStatus().state).toBe("downloaded");
    expect(service.getStatus().downloadPercent).toBe(100);
  });

  it("clamps download progress between 0 and 100", async () => {
    const service = new UpdateService();

    getHandler("download-progress")({ percent: -50 });
    expect(service.getStatus().downloadPercent).toBe(0);

    getHandler("download-progress")({ percent: 250 });
    expect(service.getStatus().downloadPercent).toBe(100);
  });

  it("handles update-not-available with version info", async () => {
    const service = new UpdateService();

    getHandler("update-not-available")({ version: "0.5.0", releaseNotes: null });
    expect(service.getStatus().state).toBe("not_available");
    expect(service.getStatus().latestVersion).toBe("0.5.0");
  });

  it("captures error message on error event", async () => {
    const service = new UpdateService();

    getHandler("error")(new Error("network down"));
    expect(service.getStatus().state).toBe("error");
    expect(service.getStatus().error).toBe("network down");
  });

  it("joins multi-note release notes with double newlines", async () => {
    const service = new UpdateService();

    getHandler("update-available")({
      version: "1.1.0",
      releaseNotes: [{ note: "Feature A" }, { note: "Feature B" }, { note: null }],
    });
    expect(service.getStatus().releaseNotes).toBe("Feature A\n\nFeature B");
  });

  it("returns null release notes when array contains no string entries", async () => {
    const service = new UpdateService();

    getHandler("update-available")({
      version: "1.1.0",
      releaseNotes: [{ note: null }, { note: "" }],
    });
    expect(service.getStatus().releaseNotes).toBeNull();
  });
});

describe("updateService.checkForUpdates", () => {
  it("returns current status without invoking autoUpdater when not packaged", async () => {
    isPackagedRef.value = false;
    const service = new UpdateService();

    const status = await service.checkForUpdates();
    expect(status.state).toBe("unsupported");
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
  });

  it("transitions to available when autoUpdater reports an update", async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "2.0.0", releaseNotes: "rel" },
    });
    const service = new UpdateService();

    const status = await service.checkForUpdates();
    expect(status.state).toBe("available");
    expect(status.latestVersion).toBe("2.0.0");
  });

  it("transitions to not_available when autoUpdater reports no update", async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: "0.5.0", releaseNotes: null },
    });
    const service = new UpdateService();

    const status = await service.checkForUpdates();
    expect(status.state).toBe("not_available");
    expect(status.latestVersion).toBe("0.5.0");
  });

  it("transitions to not_available when autoUpdater returns null", async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue(null);
    const service = new UpdateService();

    const status = await service.checkForUpdates();
    expect(status.state).toBe("not_available");
  });

  it("captures error message when autoUpdater throws", async () => {
    autoUpdaterMock.checkForUpdates.mockRejectedValue(new Error("ECONNREFUSED"));
    const service = new UpdateService();

    const status = await service.checkForUpdates();
    expect(status.state).toBe("error");
    expect(status.error).toBe("ECONNREFUSED");
  });

  it("falls back to a generic error message for non-Error throws", async () => {
    autoUpdaterMock.checkForUpdates.mockRejectedValue({ weird: true });
    const service = new UpdateService();

    const status = await service.checkForUpdates();
    expect(status.error).toBe("Update request failed.");
  });
});

describe("updateService.downloadUpdate", () => {
  it("does nothing when not packaged", async () => {
    isPackagedRef.value = false;
    const service = new UpdateService();

    await service.downloadUpdate();
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
  });

  it("ignores requests when state is not available or downloading", async () => {
    const service = new UpdateService();
    // Default state is "idle"
    await service.downloadUpdate();
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
  });

  it("invokes autoUpdater.downloadUpdate when state is available", async () => {
    autoUpdaterMock.downloadUpdate.mockResolvedValue(undefined);
    const service = new UpdateService();
    getHandler("update-available")({ version: "1.0.0", releaseNotes: null });

    await service.downloadUpdate();
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledOnce();
    expect(service.getStatus().state).toBe("downloading");
  });

  it("captures error when downloadUpdate throws", async () => {
    autoUpdaterMock.downloadUpdate.mockRejectedValue(new Error("disk full"));
    const service = new UpdateService();
    getHandler("update-available")({ version: "1.0.0", releaseNotes: null });

    await service.downloadUpdate();
    expect(service.getStatus().state).toBe("error");
    expect(service.getStatus().error).toBe("disk full");
  });
});

describe("updateService.installUpdate", () => {
  it("does nothing when not packaged", async () => {
    isPackagedRef.value = false;
    const service = new UpdateService();

    service.installUpdate();
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();
  });

  it("does nothing when status is not downloaded", async () => {
    const service = new UpdateService();

    service.installUpdate();
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();
  });

  it("invokes quitAndInstall when status is downloaded", async () => {
    const service = new UpdateService();
    getHandler("update-downloaded")({ version: "1.0.0", releaseNotes: null });

    service.installUpdate();
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledOnce();
  });
});

describe("updateService.onStatus", () => {
  it("notifies listeners on every status transition", async () => {
    const service = new UpdateService();
    const listener = vi.fn();
    const unsubscribe = service.onStatus(listener);

    getHandler("checking-for-update")(undefined);
    getHandler("update-available")({ version: "1.0.0", releaseNotes: null });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]?.[0].state).toBe("checking");
    expect(listener.mock.calls[1]?.[0].state).toBe("available");

    unsubscribe();
    getHandler("error")(new Error("boom"));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("updateService.setAllowPrerelease", () => {
  it("flips the autoUpdater.allowPrerelease flag", async () => {
    const service = new UpdateService();

    service.setAllowPrerelease(true);
    expect(autoUpdaterMock.allowPrerelease).toBeTruthy();

    service.setAllowPrerelease(false);
    expect(autoUpdaterMock.allowPrerelease).toBeFalsy();
  });
});
