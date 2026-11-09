import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { buildReleaseUrl } from "@shared/update-release";
import { useUpdater } from "../hooks/use-updater";

function normalizeVersion(version: null | string): string {
  if (!version) {
    return "";
  }

  return version.startsWith("v") ? version : `v${version}`;
}

function UpdateAvailablePopup(): null | React.ReactElement {
  const { t } = useTranslation();
  const { download, install, isDownloading, status } = useUpdater();
  const [dismissed, setDismissed] = useState(false);

  const shouldShow =
    status?.state === "available" ||
    status?.state === "downloading" ||
    status?.state === "downloaded";

  if (dismissed || !shouldShow) {
    return null;
  }

  const displayVersion = normalizeVersion(status?.latestVersion);
  const releaseUrl = status?.latestVersion ? buildReleaseUrl(status.latestVersion) : undefined;

  const handleDownloadAndInstall = () => {
    if (status?.state === "downloaded") {
      install();
    } else {
      download();
    }
  };

  const handleRemindLater = () => {
    setDismissed(true);
  };

  return (
    <div className="update-popup">
      <div className="update-popup__content">
        <h4 className="update-popup__title">{t("updatePopup.title")}</h4>
        <p className="update-popup__description">
          {t("updatePopup.description", { version: displayVersion })}
        </p>
        {status?.manualInstall && (
          <p className="update-popup__description">{t("settings.updates.manualInstall")}</p>
        )}
        {status?.state === "downloading" && (
          <progress
            aria-label={t("updatePopup.downloading")}
            max={100}
            value={Math.round(status.downloadPercent ?? 0)}
          />
        )}
        {status?.error && (
          <p className="settings-updates__error" role="alert">
            {status.error}
          </p>
        )}
        <a
          className="update-popup__link"
          href={releaseUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("updatePopup.changelog")}
        </a>
        <div className="update-popup__actions">
          <button
            className="update-popup__button update-popup__button--primary"
            disabled={isDownloading}
            onClick={handleDownloadAndInstall}
            type="button"
          >
            {isDownloading
              ? t("updatePopup.downloading")
              : status?.state === "downloaded"
                ? t("settings.updates.actions.install")
                : t("settings.updates.actions.download")}
          </button>
          <button
            className="update-popup__button update-popup__button--secondary"
            disabled={isDownloading}
            onClick={handleRemindLater}
            type="button"
          >
            {t("updatePopup.remindLater")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpdateAvailablePopup;
