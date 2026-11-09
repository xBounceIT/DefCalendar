import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadMacUpdate,
  installMacUpdate,
  resolveMacUpdateDownload,
} from "../src/main/update/macos-update";

const { fetchMock, openPathMock, spawnMock, quitMock, paths } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  openPathMock: vi.fn(),
  spawnMock: vi.fn(),
  quitMock: vi.fn(),
  paths: {
    userData: "",
    exe: "/Applications/DefCalendar.app/Contents/MacOS/DefCalendar",
    home: "/Users/test",
  },
}));

vi.mock("@main/electron-runtime", () => ({
  app: { getPath: (name: keyof typeof paths) => paths[name], quit: quitMock },
  net: { fetch: fetchMock },
  shell: { openPath: openPathMock },
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));

const execFileAsync = promisify(execFile);
let diskImage = "";

const payload = Buffer.from("a complete disk image");
const release = {
  version: "1.0.0",
  files: [
    { url: "DefCalendar-1.0.0-mac-universal.zip", sha512: "unused" },
    {
      url: "DefCalendar-1.0.0-mac-universal.dmg",
      sha512: createHash("sha512").update(payload).digest("base64"),
      size: payload.length,
    },
  ],
};

beforeEach(async () => {
  paths.userData = await mkdtemp(join(tmpdir(), "defcalendar-update-test-"));
  paths.exe = "/Applications/DefCalendar.app/Contents/MacOS/DefCalendar";
  diskImage = join(paths.userData, "image with spaces.dmg");
  await writeFile(diskImage, payload);
  fetchMock.mockReset().mockImplementation(async () => new Response(payload));
  openPathMock.mockReset().mockResolvedValue("");
  quitMock.mockReset();
  spawnMock.mockReset().mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  });
});

afterEach(async () => {
  await rm(paths.userData, { recursive: true, force: true });
});

describe("macOS update download", () => {
  it.each(["1.0.0", "v1.0.0", "1.0.0-beta.1"])(
    "resolves the DMG from the checked release %s",
    (version) => {
      expect(resolveMacUpdateDownload({ ...release, version }).url).toBe(
        `https://github.com/xBounceIT/DefCalendar/releases/download/${version.startsWith("v") ? version : `v${version}`}/DefCalendar-1.0.0-mac-universal.dmg`,
      );
    },
  );

  it("rejects releases without a DMG and checksum", async () => {
    await expect(
      downloadMacUpdate({ version: "1.0.0", files: [release.files[0]!] }, vi.fn()),
    ).rejects.toThrow("verified macOS DMG");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 0, 1.5])(
    "rejects an invalid declared size %s before downloading",
    async (size) => {
      await expect(
        downloadMacUpdate({ ...release, files: [{ ...release.files[1]!, size }] }, vi.fn()),
      ).rejects.toThrow("invalid declared size");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("streams and verifies the disk image before reporting completion", async () => {
    const progress = vi.fn();
    const path = await downloadMacUpdate(release, progress);
    expect(await readFile(path)).toStrictEqual(payload);
    expect(progress).toHaveBeenLastCalledWith(100);
    expect(await readdir(join(path, ".."))).toStrictEqual(["DefCalendar.dmg"]);
    expect(openPathMock).not.toHaveBeenCalled();
  });

  it("stops an oversized response before consuming the entire body", async () => {
    let chunks = 0;
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            chunks++;
            controller.enqueue(payload);
            if (chunks === 100) controller.close();
          },
          cancel,
        }),
      ),
    );
    await expect(downloadMacUpdate(release, vi.fn())).rejects.toThrow();
    expect(chunks).toBeLessThan(10);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels the body of a failed HTTP response", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 503 }));
    await expect(downloadMacUpdate(release, vi.fn())).rejects.toThrow("HTTP 503");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds progress notifications when the response contains many small chunks", async () => {
    const bytes = new Uint8Array(10_000).fill(42);
    let sent = 0;
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(bytes.subarray(sent, ++sent));
            if (sent === bytes.length) controller.close();
          },
        }),
      ),
    );
    const progress = vi.fn();
    await downloadMacUpdate(
      {
        version: "1.0.0",
        files: [
          {
            url: "update.dmg",
            sha512: createHash("sha512").update(bytes).digest("base64"),
            size: bytes.length,
          },
        ],
      },
      progress,
    );
    expect(progress.mock.calls.length).toBeLessThanOrEqual(101);
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("prunes previous managed downloads without touching other cache entries", async () => {
    const cache = join(paths.userData, "updates");
    await mkdir(join(cache, "mac-abandoned"), { recursive: true });
    await mkdir(join(cache, "other-data"));
    await writeFile(join(cache, "mac-abandoned", "DefCalendar.dmg.part"), "partial");
    await downloadMacUpdate(release, vi.fn());
    const entries = await readdir(cache);
    expect(entries).not.toContain("mac-abandoned");
    expect(entries).toContain("other-data");
    expect(entries).toHaveLength(2);
  });

  it.each(["checksum", "size", "http", "stream"])(
    "removes partial downloads after a %s error",
    async (failure) => {
      const info = structuredClone(release);
      if (failure === "checksum") {
        info.files[1]!.sha512 = "invalid";
      } else if (failure === "size") {
        info.files[1]!.size = payload.length + 1;
      } else if (failure === "http") {
        fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
      } else {
        fetchMock.mockResolvedValue(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(payload);
                controller.error(new Error("Connection lost"));
              },
            }),
          ),
        );
      }
      const progress = vi.fn();
      await expect(downloadMacUpdate(info, progress)).rejects.toThrow();
      expect(await readdir(join(paths.userData, "updates"))).toStrictEqual([]);
      expect(progress).not.toHaveBeenCalledWith(100);
      expect(quitMock).not.toHaveBeenCalled();
    },
  );
});

describe("macOS installer handoff", () => {
  it("starts the detached installer helper before quitting", async () => {
    await installMacUpdate(diskImage, "v1.0.0");
    expect(openPathMock).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledExactlyOnceWith(
      "/bin/sh",
      [
        "-c",
        expect.any(String),
        "defcalendar-update",
        String(process.pid),
        "/Applications/DefCalendar.app",
        "1.0.0",
        diskImage,
        "/Applications/DefCalendar.app",
      ],
      { cwd: "/", detached: true, stdio: "ignore" },
    );
    expect(spawnMock.mock.results[0]!.value.unref).toHaveBeenCalledOnce();
    expect(quitMock).toHaveBeenCalledOnce();
  });

  it("keeps DefCalendar open if the downloaded DMG has disappeared", async () => {
    await rm(diskImage);
    await expect(installMacUpdate(diskImage, "1.0.0")).rejects.toMatchObject({ code: "ENOENT" });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(quitMock).not.toHaveBeenCalled();
  });

  it("keeps DefCalendar open if the relaunch helper cannot start", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("error", new Error("Cannot start helper")));
      return child;
    });
    await expect(installMacUpdate(diskImage, "1.0.0")).rejects.toThrow("Cannot start helper");
    expect(quitMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "/Volumes/DefCalendar/DefCalendar.app/Contents/MacOS/DefCalendar",
      "/Applications/DefCalendar.app",
    ],
    [
      "/private/var/AppTranslocation/random/DefCalendar.app/Contents/MacOS/DefCalendar",
      "/Applications/DefCalendar.app",
    ],
    [
      "/Users/test/Applications/DefCalendar.app/Contents/MacOS/DefCalendar",
      "/Users/test/Applications/DefCalendar.app",
    ],
  ])("watches the installed destination for %s", async (exe, destination) => {
    paths.exe = exe;
    await installMacUpdate(diskImage, "1.0.0");
    expect(spawnMock.mock.calls[0]![1][4]).toBe(destination);
  });

  async function runHelper(mode = "success") {
    await installMacUpdate(diskImage, "1.0.0");
    const args = spawnMock.mock.calls[0]![1] as string[];
    const script = args[1]!
      .replaceAll("/usr/bin/open", "open_test")
      .replaceAll("/usr/libexec/PlistBuddy", "plist_test")
      .replaceAll("/usr/bin/codesign", "verify_test");
    const harness = `
ticks=0
kill() { ${mode === "parent-running" ? "return 0" : '[ "$ticks" -lt 2 ]'}; }
sleep() { ticks=$((ticks + 1)); }
open_test() {
  printf '%s\\n' "OPEN:$ticks:$1"
  ${mode === "open-error" ? 'case "$1" in *.dmg) return 1;; esac' : ""}
  return 0
}
plist_test() { if [ "$ticks" -lt 4 ]; then printf 0.5.0; else printf 1.0.0; fi; }
verify_test() { [ "$ticks" -ge 5 ]; }
${script}`;
    const shellPath =
      process.platform === "win32"
        ? join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe")
        : "/bin/sh";
    return execFileAsync(shellPath, ["-c", harness, ...args.slice(2)], { timeout: 5000 });
  }

  it("opens the DMG after exit and relaunches only after version and signature verification", async () => {
    const { stdout } = await runHelper();
    expect(stdout.trim().split(/\r?\n/)).toStrictEqual([
      `OPEN:2:${diskImage}`,
      "OPEN:5:/Applications/DefCalendar.app",
    ]);
  });

  it("does not open the installer when the parent does not quit", async () => {
    await expect(runHelper("parent-running")).rejects.toMatchObject({ code: 1, stdout: "" });
  });

  it("reopens the existing app if opening the DMG fails after quitting", async () => {
    await expect(runHelper("open-error")).rejects.toMatchObject({
      code: 1,
      stdout: `OPEN:2:${diskImage}\nOPEN:2:/Applications/DefCalendar.app\n`,
    });
  });
});
