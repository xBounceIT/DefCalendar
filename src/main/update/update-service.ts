import { autoUpdater, type UpdateDownloadedEvent } from "electron-updater";
import { app } from "@main/electron-runtime";
import {
  downloadMacUpdate,
  installMacUpdate,
  type MacUpdateRelease,
} from "@main/update/macos-update";
import type { AppUpdateStatus } from "@shared/schemas";

interface ReleaseNote {
  note: null | string;
  version?: string;
}

interface ReleaseInfo extends MacUpdateRelease {
  releaseNotes?: null | string | ReleaseNote[];
}

class UpdateService {
  private readonly listeners = new Set<(status: AppUpdateStatus) => void>();
  private readonly isPackaged = app.isPackaged;
  private checking = false;
  private downloading = false;
  private installing = false;
  private release: ReleaseInfo | null = null;
  private dmgPath: string | null = null;
  private status: AppUpdateStatus = {
    revision: 0,
    checkedAt: null,
    currentVersion: `v${app.getVersion()}`,
    downloadPercent: null,
    error: null,
    latestVersion: null,
    manualInstall: process.platform === "darwin",
    releaseNotes: null,
    state: "unsupported",
  };

  constructor(allowPrerelease = false) {
    if (this.isPackaged) {
      this.status.state = "idle";
    } else {
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = allowPrerelease;

    autoUpdater.on("checking-for-update", () => {
      this.setStatus({
        ...this.status,
        checkedAt: new Date().toISOString(),
        downloadPercent: null,
        error: null,
        state: "checking",
      });
    });

    autoUpdater.on("update-available", (info) => {
      if (this.downloading || this.installing) {
        return;
      }
      this.release = info;
      this.dmgPath = null;
      this.setStatus({
        ...this.status,
        checkedAt: new Date().toISOString(),
        downloadPercent: null,
        error: null,
        latestVersion: info.version,
        releaseNotes: this.resolveReleaseNotes(info),
        state: "available",
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      if (this.downloading || this.installing) {
        return;
      }
      this.release = null;
      this.dmgPath = null;
      this.setStatus({
        ...this.status,
        checkedAt: new Date().toISOString(),
        downloadPercent: null,
        error: null,
        latestVersion: info.version,
        releaseNotes: this.resolveReleaseNotes(info),
        state: "not_available",
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      if (!Number.isFinite(progress.percent)) {
        return;
      }
      this.setStatus({
        ...this.status,
        checkedAt: this.status.checkedAt ?? new Date().toISOString(),
        downloadPercent: Math.max(0, Math.min(100, progress.percent)),
        error: null,
        state: "downloading",
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.setStatus({
        ...this.status,
        checkedAt: this.status.checkedAt ?? new Date().toISOString(),
        downloadPercent: 100,
        error: null,
        latestVersion: info.version,
        releaseNotes: this.resolveReleaseNotes(info),
        state: "downloaded",
      });
    });

    autoUpdater.on("error", (error) => {
      const state = this.installing ? "downloaded" : this.downloading ? "available" : "error";
      this.installing = false;
      this.setStatus({
        ...this.status,
        checkedAt: this.status.checkedAt ?? new Date().toISOString(),
        error: error.message,
        state,
      });
    });
  }

  getStatus(): AppUpdateStatus {
    return this.status;
  }

  onStatus(listener: (status: AppUpdateStatus) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async checkForUpdates(): Promise<AppUpdateStatus> {
    if (
      !this.isPackaged ||
      this.checking ||
      this.downloading ||
      this.installing ||
      this.status.state === "downloaded"
    ) {
      return this.status;
    }

    this.checking = true;
    try {
      const checked = await autoUpdater.checkForUpdates();
      if (this.downloading || this.installing || this.getStatus().state === "downloaded") {
        return this.status;
      }
      if (!checked) {
        this.release = null;
        this.setStatus({
          ...this.status,
          checkedAt: new Date().toISOString(),
          error: null,
          state: "not_available",
        });
        return this.status;
      }

      if (checked.isUpdateAvailable && checked.updateInfo) {
        this.release = checked.updateInfo;
        this.dmgPath = null;
        this.setStatus({
          ...this.status,
          checkedAt: new Date().toISOString(),
          downloadPercent: null,
          error: null,
          latestVersion: checked.updateInfo.version,
          releaseNotes: this.resolveReleaseNotes(checked.updateInfo),
          state: "available",
        });
        return this.status;
      }

      this.release = null;
      this.setStatus({
        ...this.status,
        checkedAt: new Date().toISOString(),
        downloadPercent: null,
        error: null,
        latestVersion: checked.updateInfo?.version ?? this.status.currentVersion,
        releaseNotes: checked.updateInfo ? this.resolveReleaseNotes(checked.updateInfo) : null,
        state: "not_available",
      });
      return this.status;
    } catch (error) {
      if (this.downloading || this.installing) {
        return this.status;
      }
      this.setStatus({
        ...this.status,
        checkedAt: new Date().toISOString(),
        error: this.toErrorMessage(error),
        state: "error",
      });
      return this.status;
    } finally {
      this.checking = false;
    }
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    if (!this.isPackaged) {
      return this.status;
    }

    if (this.downloading || this.installing || this.status.state !== "available") {
      return this.status;
    }

    this.downloading = true;
    this.setStatus({
      ...this.status,
      downloadPercent: 0,
      error: null,
      state: "downloading",
    });

    try {
      if (this.status.manualInstall) {
        if (!this.release) {
          throw new Error("Check for updates before downloading.");
        }
        this.dmgPath = await downloadMacUpdate(this.release, (percent) => {
          this.setStatus({ ...this.status, downloadPercent: percent, state: "downloading" });
        });
        this.setStatus({ ...this.status, downloadPercent: 100, state: "downloaded" });
      } else {
        await autoUpdater.downloadUpdate();
      }
      await this.installUpdate();
    } catch (error) {
      this.setStatus({
        ...this.status,
        checkedAt: this.status.checkedAt ?? new Date().toISOString(),
        error: this.toErrorMessage(error),
        state: "available",
      });
    } finally {
      this.downloading = false;
    }

    return this.status;
  }

  async installUpdate(): Promise<void> {
    if (!this.isPackaged || this.installing || this.status.state !== "downloaded") {
      return;
    }

    this.installing = true;
    this.setStatus({ ...this.status, error: null });
    try {
      if (this.status.manualInstall) {
        if (!this.dmgPath || !this.status.latestVersion) {
          throw new Error("Download the macOS update before installing.");
        }
        await installMacUpdate(this.dmgPath, this.status.latestVersion);
      } else {
        autoUpdater.quitAndInstall(true, true);
      }
    } catch (error) {
      this.installing = false;
      const missingDmg =
        this.status.manualInstall &&
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT";
      if (missingDmg) {
        this.dmgPath = null;
      }
      this.setStatus({
        ...this.status,
        downloadPercent: missingDmg ? null : this.status.downloadPercent,
        error: this.toErrorMessage(error),
        state: missingDmg ? "available" : this.status.state,
      });
    }
  }

  setAllowPrerelease(allow: boolean): void {
    autoUpdater.allowPrerelease = allow;
  }

  private resolveReleaseNotes(info: ReleaseInfo | UpdateDownloadedEvent): null | string {
    const { releaseNotes } = info;
    if (typeof releaseNotes === "string") {
      return releaseNotes;
    }

    if (Array.isArray(releaseNotes)) {
      const notes = releaseNotes
        .map((entry) => entry.note)
        .filter((value): value is string => typeof value === "string" && value.length > 0);

      if (notes.length > 0) {
        return notes.join("\n\n");
      }
    }

    return null;
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    return "Update request failed.";
  }

  private setStatus(status: AppUpdateStatus): void {
    this.status = { ...status, revision: this.status.revision + 1 };

    for (const listener of this.listeners) {
      listener(this.status);
    }
  }
}

export default UpdateService;
