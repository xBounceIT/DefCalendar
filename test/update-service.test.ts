import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UpdateService from "../src/main/update/update-service";

const { isPackagedRef, getVersionMock, downloadMacUpdateMock, installMacUpdateMock } = vi.hoisted(
  () => ({
    getVersionMock: vi.fn().mockReturnValue("0.5.0"),
    isPackagedRef: { value: true },
    downloadMacUpdateMock: vi.fn(),
    installMacUpdateMock: vi.fn(),
  }),
);

vi.mock("@main/update/macos-update", () => ({
  downloadMacUpdate: downloadMacUpdateMock,
  installMacUpdate: installMacUpdateMock,
}));

vi.mock("@main/electron-runtime", () => ({
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

vi.mock("electron-updater", () => ({
  autoUpdater: autoUpdaterMock,
}));

type Listener = (arg: unknown) => void;
const originalPlatform = process.platform;

function createDeferred() {
  let resolveDeferred: () => void = () => undefined;
  let rejectDeferred: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

function getHandler(event: string): Listener {
  const call = autoUpdaterMock.on.mock.calls.find(([name]) => name === event);
  if (!call) {
    throw new Error(`No handler registered for event: ${event}`);
  }
  return call[1] as Listener;
}

beforeEach(() => {
  Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
  downloadMacUpdateMock.mockReset().mockResolvedValue("/cache/update.dmg");
  installMacUpdateMock.mockReset().mockResolvedValue(undefined);
  isPackagedRef.value = true;
  autoUpdaterMock.allowPrerelease = false;
  autoUpdaterMock.autoDownload = true;
  autoUpdaterMock.autoInstallOnAppQuit = true;
  autoUpdaterMock.checkForUpdates.mockReset();
  autoUpdaterMock.downloadUpdate.mockReset();
  autoUpdaterMock.on.mockReset();
  autoUpdaterMock.quitAndInstall.mockReset();
});

afterEach(() => {
  Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
});

describe("manual macOS updates", () => {
  beforeEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: "darwin" });
  });

  it.each(["1.0.0", "v1.0.0", "1.0.0-beta.1"])(
    "downloads and opens the DMG for %s without installing through Squirrel",
    async (version) => {
      const service = new UpdateService();
      getHandler("update-available")({ version, releaseNotes: null });

      const status = await service.downloadUpdate();

      expect(status.manualInstall).toBe(true);
      expect(status.state).toBe("downloaded");
      expect(downloadMacUpdateMock).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ version }),
        expect.any(Function),
      );
      expect(installMacUpdateMock).toHaveBeenCalledExactlyOnceWith("/cache/update.dmg", version);
      expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
      getHandler("update-downloaded")({ version, releaseNotes: null });
      await service.installUpdate();
      expect(installMacUpdateMock).toHaveBeenCalledOnce();
      expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();
    },
  );

  it("continues to check for updates and preserves manual installation mode", async () => {
    autoUpdaterMock.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "1.0.0", releaseNotes: "Notes" },
    });
    const service = new UpdateService();

    expect(await service.checkForUpdates()).toMatchObject({
      manualInstall: true,
      latestVersion: "1.0.0",
      state: "available",
    });
    expect(autoUpdaterMock.autoDownload).toBe(false);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false);
    expect(downloadMacUpdateMock).not.toHaveBeenCalled();
  });

  it("preserves the available update after a download error and allows a direct retry", async () => {
    downloadMacUpdateMock.mockRejectedValueOnce(new Error("Network error"));
    const service = new UpdateService();
    getHandler("update-available")({ version: "1.0.0", releaseNotes: null });

    expect(await service.downloadUpdate()).toMatchObject({
      error: "Network error",
      state: "available",
      manualInstall: true,
    });
    expect(installMacUpdateMock).not.toHaveBeenCalled();
    expect(await service.downloadUpdate()).toMatchObject({ state: "downloaded", error: null });
    expect(downloadMacUpdateMock).toHaveBeenCalledTimes(2);
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
  });

  it("keeps downloads exclusive and blocks checks until they finish", async () => {
    const downloading = createDeferred();
    downloadMacUpdateMock.mockReturnValue(downloading.promise.then(() => "/cache/update.dmg"));
    const service = new UpdateService();
    getHandler("update-available")({ version: "1.0.0", releaseNotes: null });
    const pending = service.downloadUpdate();
    await service.checkForUpdates();
    await service.downloadUpdate();
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    expect(downloadMacUpdateMock).toHaveBeenCalledOnce();
    const progress = downloadMacUpdateMock.mock.calls[0]![1] as (percent: number) => void;
    progress(42);
    expect(service.getStatus()).toMatchObject({ state: "downloading", downloadPercent: 42 });
    downloading.resolve();
    expect(await pending).toMatchObject({
      state: "downloaded",
      latestVersion: "1.0.0",
      error: null,
    });
  });

  it("keeps the downloaded DMG after an installer error and retries without downloading again", async () => {
    installMacUpdateMock.mockRejectedValueOnce(new Error("Cannot mount disk"));
    const service = new UpdateService();
    getHandler("update-available")({ version: "1.0.0", releaseNotes: null });
    expect(await service.downloadUpdate()).toMatchObject({
      state: "downloaded",
      error: "Cannot mount disk",
    });
    await service.installUpdate();
    expect(service.getStatus().error).toBeNull();
    expect(downloadMacUpdateMock).toHaveBeenCalledOnce();
    expect(installMacUpdateMock).toHaveBeenCalledTimes(2);
  });

  it("allows downloading again when the cached DMG has disappeared", async () => {
    installMacUpdateMock.mockRejectedValueOnce(
      Object.assign(new Error("DMG missing"), { code: "ENOENT" }),
    );
    const service = new UpdateService();
    getHandler("update-available")({ version: "1.0.0" });
    expect(await service.downloadUpdate()).toMatchObject({
      state: "available",
      error: "DMG missing",
    });
    await service.downloadUpdate();
    expect(downloadMacUpdateMock).toHaveBeenCalledTimes(2);
    expect(installMacUpdateMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates installer launches", async () => {
    const opening = createDeferred();
    installMacUpdateMock.mockReturnValueOnce(opening.promise);
    const service = new UpdateService();
    getHandler("update-available")({ version: "1.0.0", releaseNotes: null });

    const first = service.downloadUpdate();
    await vi.waitFor(() => expect(installMacUpdateMock).toHaveBeenCalledOnce());
    const second = service.installUpdate();
    opening.resolve();
    await Promise.all([first, second]);
    expect(installMacUpdateMock).toHaveBeenCalledOnce();
  });

  it("does not download when unpackaged or no update is available", async () => {
    await new UpdateService().downloadUpdate();
    isPackagedRef.value = false;
    await new UpdateService().downloadUpdate();
    expect(downloadMacUpdateMock).not.toHaveBeenCalled();
  });
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
    expect(autoUpdaterMock.autoDownload).toBe(false);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(false);
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
    expect(autoUpdaterMock.allowPrerelease).toBe(true);
    expect(service.getStatus().state).toBe("idle");
  });
});

describe("updateService event handlers", () => {
  it("increments the revision for every published transition", () => {
    const service = new UpdateService();
    const revisions: number[] = [];
    service.onStatus((status) => revisions.push(status.revision));
    getHandler("checking-for-update")(undefined);
    getHandler("update-available")({ version: "1.0.0" });
    getHandler("download-progress")({ percent: 50 });
    expect(revisions).toStrictEqual([1, 2, 3]);
    expect(service.getStatus().revision).toBe(3);
  });
  it("does not publish invalid numeric progress to the IPC schema", () => {
    const service = new UpdateService();
    const listener = vi.fn();
    service.onStatus(listener);
    getHandler("download-progress")({ percent: NaN });
    expect(service.getStatus().downloadPercent).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

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
    expect(service.getStatus().state).toBe("available");
    expect(service.getStatus().error).toBe("disk full");
  });

  it("automatically installs and restarts Windows after the requested download completes", async () => {
    const service = new UpdateService();
    getHandler("update-available")({ version: "1.0.0" });
    autoUpdaterMock.downloadUpdate.mockImplementation(async () => {
      getHandler("update-downloaded")({ version: "1.0.0" });
    });
    await service.downloadUpdate();
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });

  it("allows retrying a Windows installer that reports an error", async () => {
    const service = new UpdateService();
    getHandler("update-downloaded")({ version: "1.0.0" });
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      getHandler("error")(new Error("Installer failed"));
    });
    await service.installUpdate();
    expect(service.getStatus()).toMatchObject({ state: "downloaded", error: "Installer failed" });
    await service.installUpdate();
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledTimes(2);
  });
});

describe("updateService.installUpdate", () => {
  it("does nothing when not packaged", async () => {
    isPackagedRef.value = false;
    const service = new UpdateService();

    await service.installUpdate();
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();
  });

  it("does nothing when status is not downloaded", async () => {
    const service = new UpdateService();

    await service.installUpdate();
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled();
  });

  it("invokes quitAndInstall when status is downloaded", async () => {
    const service = new UpdateService();
    getHandler("update-downloaded")({ version: "1.0.0", releaseNotes: null });

    await service.installUpdate();
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
    expect(autoUpdaterMock.allowPrerelease).toBe(true);

    service.setAllowPrerelease(false);
    expect(autoUpdaterMock.allowPrerelease).toBe(false);
  });
});
