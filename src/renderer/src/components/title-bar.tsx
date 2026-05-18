import React from "react";
import { useTranslation } from "react-i18next";

function TitleBar(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div className="title-bar">
      <span className="title-bar-title">{t("common.appName")}</span>
    </div>
  );
}

export default TitleBar;
