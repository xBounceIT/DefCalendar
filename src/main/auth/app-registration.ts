const PLACEHOLDER_CLIENT_ID = "your-app-client-id";
const BUNDLED_CLIENT_ID = "510ba437-27ff-4d89-8b52-cd1896d41203";

const bundledMsalApp = {
  authority: "https://login.microsoftonline.com/organizations",
  clientId: BUNDLED_CLIENT_ID,
} as const;

function hasConfiguredClientId(clientId: string): boolean {
  return clientId.trim().length > 0 && clientId !== PLACEHOLDER_CLIENT_ID;
}

export { BUNDLED_CLIENT_ID, bundledMsalApp, hasConfiguredClientId, PLACEHOLDER_CLIENT_ID };
