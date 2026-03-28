import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

function handleMinimize(): void {
  void globalThis.calendarApi.window.minimize();
}

function handleClose(): void {
  void globalThis.calendarApi.window.close();
}

function TitleBar(): React.ReactElement {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await globalThis.calendarApi.window.isMaximized();
      setIsMaximized(maximized);
    };

    checkMaximized();

    const handleResize = () => {
      void checkMaximized();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleMaximize = async () => {
    await globalThis.calendarApi.window.maximize();
    const maximized = await globalThis.calendarApi.window.isMaximized();
    setIsMaximized(maximized);
  };

  return (
    <div className="title-bar">
      <div className="title-bar-border" />
      <div className="title-bar-content">
        <div className="title-bar-brand">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="title-bar-icon"
          >
            <rect
              x="3"
              y="4"
              width="18"
              height="18"
              rx="2"
              ry="2"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="2" />
            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="2" />
            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="title-bar-title">{t("common.appName")}</span>
        </div>
        <div className="title-bar-controls">
          <button
            className="title-bar-button title-bar-button--minimize"
            onClick={handleMinimize}
            title={t("titleBar.minimize")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="6" x2="11" y2="6" />
            </svg>
          </button>
          <button
            className="title-bar-button title-bar-button--maximize"
            onClick={handleMaximize}
            title={isMaximized ? t("titleBar.restore") : t("titleBar.maximize")}
          >
            {isMaximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="3" width="7" height="7" />
                <path d="M3 3V1h8v8h-2" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="1" width="10" height="10" />
              </svg>
            )}
          </button>
          <button
            className="title-bar-button title-bar-button--close"
            onClick={handleClose}
            title={t("titleBar.close")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="1" y1="11" x2="11" y2="1" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default TitleBar;
