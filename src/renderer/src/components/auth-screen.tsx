import React from "react";
import { useTranslation } from "react-i18next";

interface AuthScreenProps {
  errorMessage: null | string;
  isPending: boolean;
  pendingMode: "admin_consent" | "user";
  onAdminApproval: () => void;
  onSignIn: () => void;
  showAdminApprovalAction: boolean;
}

function MicrosoftIcon() {
  return (
    <svg className="microsoft-icon" viewBox="0 0 23 23" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

function SignInButton({
  buttonLabel,
  isPending,
  onSignIn,
}: {
  buttonLabel: string;
  isPending: boolean;
  onSignIn: () => void;
}) {
  return (
    <button className="microsoft-button" disabled={isPending} onClick={onSignIn} type="button">
      <MicrosoftIcon />
      <span>{buttonLabel}</span>
    </button>
  );
}

function AdminApprovalButton({
  adminApprovalLabel,
  isPending,
  onAdminApproval,
}: {
  adminApprovalLabel: string;
  isPending: boolean;
  onAdminApproval: () => void;
}) {
  return (
    <button className="secondary-button" disabled={isPending} onClick={onAdminApproval} type="button">
      {adminApprovalLabel}
    </button>
  );
}

function AuthHeader() {
  const { t } = useTranslation();

  return (
    <div className="auth-header">
      <h1 className="auth-title">{t("auth.welcomeTitle")}</h1>
      <p className="auth-welcome-message">{t("auth.welcomeSubtitle")}</p>
    </div>
  );
}

function AuthActions({
  adminApprovalLabel,
  buttonLabel,
  isPending,
  onAdminApproval,
  onSignIn,
  showAdminApprovalAction,
}: {
  adminApprovalLabel: string;
  buttonLabel: string;
  isPending: boolean;
  onAdminApproval: () => void;
  onSignIn: () => void;
  showAdminApprovalAction: boolean;
}) {
  let adminApprovalButton: React.JSX.Element | null = null;
  if (showAdminApprovalAction) {
    adminApprovalButton = (
      <AdminApprovalButton
        adminApprovalLabel={adminApprovalLabel}
        isPending={isPending}
        onAdminApproval={onAdminApproval}
      />
    );
  }

  return (
    <div className="auth-actions">
      <SignInButton buttonLabel={buttonLabel} isPending={isPending} onSignIn={onSignIn} />
      {adminApprovalButton}
    </div>
  );
}

function AuthCard({
  errorMessage,
  isPending,
  onAdminApproval,
  onSignIn,
  pendingMode,
  showAdminApprovalAction,
}: AuthScreenProps) {
  const { t } = useTranslation();

  let buttonLabel = t("auth.signIn");
  if (isPending && pendingMode === "user") {
    buttonLabel = t("auth.connecting");
  }

  let adminApprovalLabel = t("auth.adminApproval");
  if (isPending && pendingMode === "admin_consent") {
    adminApprovalLabel = t("auth.requestingApproval");
  }

  let errorBanner: React.JSX.Element | null = null;
  if (errorMessage) {
    errorBanner = <p className="banner banner--error">{errorMessage}</p>;
  }

  return (
    <div className="auth-card">
      <AuthHeader />
      <div className="auth-content">
        <AuthActions
          adminApprovalLabel={adminApprovalLabel}
          buttonLabel={buttonLabel}
          isPending={isPending}
          onAdminApproval={onAdminApproval}
          onSignIn={onSignIn}
          showAdminApprovalAction={showAdminApprovalAction}
        />
        {errorBanner}
      </div>
    </div>
  );
}

function AuthScreen(props: AuthScreenProps) {
  return (
    <div className="auth-shell">
      <AuthCard
        errorMessage={props.errorMessage}
        isPending={props.isPending}
        onAdminApproval={props.onAdminApproval}
        onSignIn={props.onSignIn}
        pendingMode={props.pendingMode}
        showAdminApprovalAction={props.showAdminApprovalAction}
      />
    </div>
  );
}

export default AuthScreen;
