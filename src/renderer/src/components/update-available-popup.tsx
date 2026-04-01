import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdater } from "../hooks/use-updater";

const GITHUB_OWNER = "xBounceIT";
const GITHUB_REPO = "DefCalendar";

function buildReleaseUrl(version: string): string {
  const normalized = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${normalized}`;
}

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
  const initiatedDownloadRef = useRef(false);

  const shouldShow =
    status?.state === "available" ||
    (status?.state === "downloading" && initiatedDownloadRef.current) ||
    (status?.state === "downloaded" && initiatedDownloadRef.current);

  useEffect(() => {
    if (status?.state === "downloaded" && initiatedDownloadRef.current) {
      install();
      initiatedDownloadRef.current = false;
    }
  }, [status?.state, install]);

  if (dismissed || !shouldShow) {
    return null;
  }

  const displayVersion = normalizeVersion(status?.latestVersion);
  const releaseUrl = status?.latestVersion ? buildReleaseUrl(status.latestVersion) : null;

  const handleDownloadAndRestart = async () => {
    initiatedDownloadRef.current = true;
    await download();
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
            onClick={handleDownloadAndRestart}
            type="button"
          >
            {isDownloading ? t("updatePopup.downloading") : t("updatePopup.downloadAndRestart")}
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
