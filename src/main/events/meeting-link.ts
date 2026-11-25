type OpenExternal = (url: string) => Promise<void>;

function nativeSchemeFor(hostname: string, pathname: string): string | null {
  if (hostname === "teams.microsoft.com" || hostname.endsWith(".teams.microsoft.com")) {
    return pathname.startsWith("/l/meetup-join/") ? "msteams" : null;
  }
  if (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) {
    return pathname.startsWith("/j/") || pathname.startsWith("/wc/join/") ? "zoommtg" : null;
  }
  if (hostname === "webex.com" || hostname.endsWith(".webex.com")) {
    return pathname.includes("/j.php") ||
      pathname.startsWith("/meet/") ||
      pathname.startsWith("/join/")
      ? "wbx"
      : null;
  }
  return null;
}

function parseHttpsUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

export function toNativeMeetingUrl(url: string): string | null {
  const parsed = parseHttpsUrl(url);
  if (!parsed) {
    return null;
  }
  const scheme = nativeSchemeFor(parsed.hostname.toLowerCase(), parsed.pathname.toLowerCase());
  if (!scheme) {
    return null;
  }
  return `${scheme}://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

async function tryOpen(url: string, openExternal: OpenExternal): Promise<boolean> {
  try {
    await openExternal(url);
    return true;
  } catch {
    return false;
  }
}

export async function openMeetingLink(
  url: string,
  openExternal: OpenExternal,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform === "darwin") {
    const nativeUrl = toNativeMeetingUrl(url);
    if (nativeUrl && (await tryOpen(nativeUrl, openExternal))) {
      return;
    }
  }
  await openExternal(url);
}
