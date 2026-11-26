type OpenExternal = (url: string) => Promise<void>;

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function getMeetingProvider(parsed: URL) {
  if (parsed.protocol !== "https:") {
    return null;
  }
  const { hostname } = parsed;
  const path = parsed.pathname.toLowerCase();
  if (
    matchesDomain(hostname, "teams.microsoft.com") &&
    /^\/(?:l\/meetup-join|meet)\/.+/.test(path)
  ) {
    return "teams";
  }
  if (
    matchesDomain(hostname, "zoom.us") &&
    (/^\/(?:j|my|wc\/join)\/.+/.test(path) || /^\/wc\/\d+\/join\/?$/.test(path))
  ) {
    return "zoom";
  }
  if (matchesDomain(hostname, "meet.google.com") && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(path)) {
    return "google";
  }
  if (
    matchesDomain(hostname, "webex.com") &&
    (path.includes("/j.php") || path.startsWith("/meet/") || path.startsWith("/join/"))
  ) {
    return "webex";
  }
  return null;
}

export function isKnownMeetingUrl(url: string): boolean {
  const parsed = URL.parse(url);
  return parsed !== null && getMeetingProvider(parsed) !== null;
}

function swapScheme(parsed: URL, scheme: string): string {
  return `${scheme}://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function zoomJoinUrl(parsed: URL): string | null {
  const confno = /^\/(?:j|wc(?:\/join)?)\/(\d{8,})(?:\/|$)/i.exec(parsed.pathname)?.[1];
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

function toNativeMeetingUrl(url: string): string | null {
  const parsed = URL.parse(url);
  if (!parsed) {
    return null;
  }
  const provider = getMeetingProvider(parsed);
  if (provider === "teams") {
    return swapScheme(parsed, "msteams");
  }
  if (provider === "zoom") {
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
