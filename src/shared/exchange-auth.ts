const EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE =
  'Your Microsoft 365 admin must approve Project Calendar before people in this organization can connect. Ask an admin to click Use Exchange 365 once and approve access for the organization.';

const EXCHANGE365_CLIENT_ID_NOT_CONFIGURED_MESSAGE =
  'Project Calendar is not configured with a Microsoft app registration yet. Set the bundled Microsoft public-client ID before using Exchange 365 sign-in.';

const EXCHANGE365_REPLY_URL_NOT_CONFIGURED_MESSAGE =
  'Microsoft sign-in is blocked because this app registration is missing the localhost desktop reply URL (AADSTS500113). Add the Mobile and desktop redirect URI http://localhost and enable public client flows in Microsoft Entra.';

function isAdminApprovalRequiredMessage(message: null | string | undefined): boolean {
  return message === EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE;
}

export {
  EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE,
  EXCHANGE365_CLIENT_ID_NOT_CONFIGURED_MESSAGE,
  EXCHANGE365_REPLY_URL_NOT_CONFIGURED_MESSAGE,
  isAdminApprovalRequiredMessage,
};
