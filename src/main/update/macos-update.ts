import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { join, posix } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { app, net } from "@main/electron-runtime";
import { buildReleaseUrl } from "@shared/update-release";

export interface MacUpdateRelease {
  version: string;
  files?: { url: string; sha512: string; size?: number }[];
}

export function resolveMacUpdateDownload(info: MacUpdateRelease) {
  const file = info.files?.find((entry) => {
    const url = new URL(entry.url, "https://github.com/");
    return url.pathname.endsWith(".dmg");
  });
  if (!file?.sha512) {
    throw new Error("The release does not contain a verified macOS DMG.");
  }
  if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size <= 0)) {
    throw new Error("The macOS DMG has an invalid declared size.");
  }

  const fileName = posix.basename(new URL(file.url, "https://github.com/").pathname);
  const url = `${buildReleaseUrl(info.version).replace("/tag/", "/download/")}/${fileName}`;
  return { ...file, url };
}

export async function downloadMacUpdate(
  info: MacUpdateRelease,
  onProgress: (percent: number) => void,
): Promise<string> {
  const file = resolveMacUpdateDownload(info);
  const cache = join(app.getPath("userData"), "updates");
  await mkdir(cache, { recursive: true });
  const previous = await readdir(cache, { withFileTypes: true });
  await Promise.all(
    previous
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("mac-"))
      .map((entry) =>
        rm(join(cache, entry.name), { recursive: true, force: true }).catch(() => undefined),
      ),
  );
  const directory = await mkdtemp(join(cache, "mac-"));
  const destination = join(directory, "DefCalendar.dmg");
  const partial = `${destination}.part`;

  try {
    const response = await net.fetch(file.url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Unable to download the update (HTTP ${response.status}).`);
    }

    const hash = createHash("sha512");
    const total = file.size ?? Number(response.headers.get("content-length"));
    let received = 0;
    let lastPercent = -1;
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        received += chunk.length;
        if (file.size !== undefined && received > file.size) {
          callback(new Error("The downloaded update exceeds its declared size."));
          return;
        }
        if (total > 0) {
          const percent = Math.min(99, Math.floor((received / total) * 100));
          if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress(percent);
          }
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>),
      progress,
      createWriteStream(partial),
    );
    if (
      (file.size !== undefined && received !== file.size) ||
      hash.digest("base64") !== file.sha512
    ) {
      throw new Error("The downloaded update failed its integrity check. Please try again.");
    }
    await rename(partial, destination);
    onProgress(100);
    return destination;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

const RELAUNCH_SCRIPT = `
attempt=0
while kill -0 "$1" 2>/dev/null; do
  if [ "$attempt" -ge 60 ]; then
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done
if ! /usr/bin/open "$4"; then
  /usr/bin/open "$5"
  exit 1
fi
attempt=0
while [ "$attempt" -lt 1800 ]; do
  for destination in "$2" "/Applications/DefCalendar.app"; do
    version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$destination/Contents/Info.plist" 2>/dev/null)
    if [ "$version" = "$3" ] && /usr/bin/codesign --verify --deep --strict "$destination" 2>/dev/null; then
      /usr/bin/open "$destination"
      exit $?
    fi
  done
  attempt=$((attempt + 1))
  sleep 1
done
`;

export async function installMacUpdate(dmgPath: string, version: string): Promise<void> {
  await access(dmgPath);
  const bundle = posix.resolve(app.getPath("exe"), "../../..");
  const applications = ["/Applications/", `${app.getPath("home")}/Applications/`];
  const destination = applications.some((directory) => bundle.startsWith(directory))
    ? bundle
    : "/Applications/DefCalendar.app";
  const helper = spawn(
    "/bin/sh",
    [
      "-c",
      RELAUNCH_SCRIPT,
      "defcalendar-update",
      String(process.pid),
      destination,
      version.replace(/^v/, ""),
      dmgPath,
      bundle,
    ],
    { cwd: "/", detached: true, stdio: "ignore" },
  );
  await new Promise<void>((resolve, reject) => {
    helper.once("error", reject);
    helper.once("spawn", resolve);
  });
  helper.unref();
  app.quit();
}
