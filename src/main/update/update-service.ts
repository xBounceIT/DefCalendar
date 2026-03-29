import { app } from "@main/electron-runtime";
import type { AppUpdateStatus } from "@shared/schemas";
import { autoUpdater, type UpdateDownloadedEvent } from "electron-updater";

interface ReleaseNote {
  note: null | string;
  version?: string;
}

interface ReleaseInfo {
  releaseName?: string;
  releaseNotes?: null | string | ReleaseNote[];
  version: string;
}

class UpdateService {
  private readonly listeners = new Set<(status: AppUpdateStatus) => void>();
  private readonly isPackaged = app.isPackaged;
  private status: AppUpdateStatus = {
    checkedAt: null,
    currentVersion: `v${app.getVersion()}`,
    downloadPercent: null,
    error: null,
    latestVersion: null,
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
      this.setStatus({
        ...this.status,
        checkedAt: this.status.checkedAt ?? new Date().toISOString(),
        error: error.message,
        state: "error",
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
    if (!this.isPackaged) {
      return this.status;
    }

    try {
      const checked = await autoUpdater.checkForUpdates();
      if (!checked) {
        this.setStatus({
          ...this.status,
          checkedAt: new Date().toISOString(),
          error: null,
          state: "not_available",
        });
        return this.status;
      }

      if (checked.isUpdateAvailable && checked.updateInfo) {
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
      this.setStatus({
        ...this.status,
        checkedAt: new Date().toISOString(),
        error: this.toErrorMessage(error),
        state: "error",
      });
      return this.status;
    }
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    if (!this.isPackaged) {
      return this.status;
    }

    if (this.status.state !== "available" && this.status.state !== "downloading") {
      return this.status;
    }

    this.setStatus({
      ...this.status,
      downloadPercent: this.status.downloadPercent ?? 0,
      error: null,
      state: "downloading",
    });

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.setStatus({
        ...this.status,
        checkedAt: this.status.checkedAt ?? new Date().toISOString(),
        error: this.toErrorMessage(error),
        state: "error",
      });
    }

    return this.status;
  }

  installUpdate(): void {
    if (!this.isPackaged || this.status.state !== "downloaded") {
      return;
    }

    autoUpdater.quitAndInstall();
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
    this.status = status;

    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export default UpdateService;
