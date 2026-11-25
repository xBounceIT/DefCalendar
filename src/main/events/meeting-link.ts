type OpenExternal = (url: string) => Promise<void>;

function parseHttpsUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function swapScheme(parsed: URL, scheme: string): string {
  return `${scheme}://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function zoomJoinUrl(parsed: URL): string | null {
  const confno = parsed.pathname.split("/").find((segment) => /^\d{8,}$/.test(segment));
  if (!confno) {
    return null;
  }
  const params = new URLSearchParams({ action: "join", confno });
  const pwd = parsed.searchParams.get("pwd");
  if (pwd) {
    params.set("pwd", pwd);
  }
  return `zoommtg://zoom.us/join?${params.toString()}`;
}

export function toNativeMeetingUrl(url: string): string | null {
  const parsed = parseHttpsUrl(url);
  if (!parsed) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  if (hostname === "teams.microsoft.com" || hostname.endsWith(".teams.microsoft.com")) {
    return pathname.startsWith("/l/meetup-join/") || pathname.startsWith("/meet/")
      ? swapScheme(parsed, "msteams")
      : null;
  }
  if (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) {
    if (!pathname.startsWith("/j/") && !pathname.startsWith("/wc/")) {
      return null;
    }
    return zoomJoinUrl(parsed);
  }
  return null;
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
