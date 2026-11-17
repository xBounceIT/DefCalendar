import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

interface ReleaseStep {
  name?: string;
  if?: string;
  shell?: string;
  run?: string;
  env?: Record<string, string>;
}

interface ReleaseWorkflow {
  jobs: {
    build: { steps: ReleaseStep[] };
    publish: { if: string; needs: string; steps: ReleaseStep[] };
  };
}

const require = createRequire(import.meta.url);
const { load, dump } = require("js-yaml") as {
  load(source: string): ReleaseWorkflow;
  dump(value: unknown): string;
};
const { verifyReleaseAssets } = require("../.github/scripts/verify-release-assets.cjs") as {
  verifyReleaseAssets(platform: string, version: string, directory: string): Promise<void>;
};
const workflow = load(
  readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
);
const macBuild = workflow.jobs.build.steps.find(
  (step) => step.name === "Build macOS universal assets",
);
const macVerify = workflow.jobs.build.steps.find(
  (step) => step.name === "Verify macOS universal binaries",
);
const execFileAsync = promisify(execFile);
const shell =
  process.platform === "win32"
    ? join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe")
    : "/bin/bash";

function runBash(script: string, env: NodeJS.ProcessEnv, cwd?: string) {
  return execFileAsync(shell, ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script], {
    cwd,
    env,
    timeout: 10_000,
  });
}

async function runMacBuild(certificate: string | undefined, exitCode = 0) {
  if (!macBuild?.run) {
    throw new Error("The macOS release build step is missing.");
  }

  const env = { ...process.env };
  if (certificate === undefined) {
    delete env.CSC_LINK;
  } else {
    env.CSC_LINK = certificate;
  }
  const script = `npm() { printf 'ARG:%s\\n' "$@"; return ${exitCode}; }\n${macBuild.run}`;
  const { stdout, stderr } = await runBash(script, env);
  const args = stdout
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.startsWith("ARG:"))
    .map((line) => line.slice(4));
  return { args, stdout, stderr };
}

function runMacVerification(requireDeveloperId: boolean, identity: string) {
  if (!macVerify?.run) {
    throw new Error("The macOS release verification step is missing.");
  }
  const script = `
lipo() { return 0; }
plist_test() { printf alert; }
codesign() {
  for argument in "$@"; do
    if [[ "$argument" == '=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists' ]]; then
      printf 'DEVELOPER_ID_CHECK\\n'
      [[ "$TEST_SIGNING_IDENTITY" == 'Developer ID Application' ]]
      return $?
    fi
  done
  printf 'SIGNATURE_CHECK\\n'
}
${macVerify.run.replaceAll("/usr/libexec/PlistBuddy", "plist_test")}`;
  return runBash(script, {
    ...process.env,
    REQUIRE_DEVELOPER_ID: String(requireDeveloperId),
    TEST_SIGNING_IDENTITY: identity,
  });
}

describe("macOS release signing", () => {
  it("keeps the signing logic scoped to the macOS build", () => {
    expect.hasAssertions();
    expect(macBuild?.if).toBe("matrix.platform == 'mac'");
    expect(macBuild?.shell).toBe("bash");
  });

  it.each([undefined, ""])("warns and builds ad-hoc when CSC_LINK is %j", async (certificate) => {
    expect.hasAssertions();
    const { args, stdout } = await runMacBuild(certificate);

    expect(args).toStrictEqual([
      "run",
      "dist",
      "--",
      "--mac",
      "--universal",
      "--publish",
      "never",
      "-c.mac.identity=-",
      "-c.mac.notarize=false",
    ]);
    expect(stdout).toContain("::warning::macOS artifacts use ad-hoc signing");
  });

  it.each([
    { label: "base64", certificate: "test-base64-certificate" },
    { label: "Unicode path", certificate: "/Users/test/Certificati personali/identità.p12" },
    { label: "shell metacharacters", certificate: "test$(printf INJECTED);`printf SHELL`" },
  ])("requires a distribution identity with a $label certificate", async ({ certificate }) => {
    expect.hasAssertions();
    const { args, stdout, stderr } = await runMacBuild(certificate);

    expect(args).toStrictEqual([
      "run",
      "dist",
      "--",
      "--mac",
      "--universal",
      "--publish",
      "never",
      "-c.forceCodeSigning=true",
      "-c.mac.type=distribution",
    ]);
    expect(stdout).not.toContain("::warning::");
    expect(`${stdout}${stderr}`).not.toContain(certificate);
    expect(`${stdout}${stderr}`).not.toMatch(/INJECTED|SHELL/);
  });

  it.each([undefined, "test-certificate"])(
    "fails the release when the build fails with CSC_LINK %j",
    async (certificate) => {
      expect.hasAssertions();
      await expect(runMacBuild(certificate, 23)).rejects.toMatchObject({ code: 23 });
    },
  );

  it("requires output identity verification only when a release certificate is configured", () => {
    expect.hasAssertions();
    expect(macVerify?.if).toBe("matrix.platform == 'mac'");
    expect(macVerify?.shell).toBe("bash");
    expect(macVerify?.env?.REQUIRE_DEVELOPER_ID).toMatch(
      /^\$\{\{ github\.event_name == 'push' && secrets\.MAC_CSC_LINK != '' \}\}$/,
    );
  });

  it("allows ad-hoc signing in pull requests and reserves credentials for tag builds", () => {
    expect.hasAssertions();
    expect(macBuild?.env?.CSC_FOR_PULL_REQUEST).toBe("${{ github.event_name == 'pull_request' }}");
    const credentials = Object.entries(macBuild?.env ?? {}).filter(
      ([name]) => name !== "CSC_FOR_PULL_REQUEST",
    );
    expect(credentials).toHaveLength(5);
    for (const [, value] of credentials) {
      expect(value).toMatch(/^\$\{\{ github\.event_name == 'push' && secrets\.\w+ \|\| '' \}\}$/);
    }
  });

  it("accepts a Developer ID Application signature", async () => {
    expect.hasAssertions();
    const { stdout } = await runMacVerification(true, "Developer ID Application");
    expect(stdout.trim().split(/\r?\n/)).toStrictEqual(["SIGNATURE_CHECK", "DEVELOPER_ID_CHECK"]);
  });

  it.each([
    "Apple Development",
    "Apple Distribution",
    "self-signed Developer ID Application",
    "ad-hoc",
  ])("rejects a %s output signature when a release certificate is configured", async (identity) => {
    expect.hasAssertions();
    await expect(runMacVerification(true, identity)).rejects.toMatchObject({
      code: 1,
      stdout: "SIGNATURE_CHECK\nDEVELOPER_ID_CHECK\n",
    });
  });

  it("preserves generic signature verification for ad-hoc releases", async () => {
    expect.hasAssertions();
    const { stdout } = await runMacVerification(false, "ad-hoc");
    expect(stdout.trim()).toBe("SIGNATURE_CHECK");
  });
});

describe("release asset staging", () => {
  const version = "0.10.11";
  const installers = [
    `DefCalendar-${version}-mac-universal.zip`,
    `DefCalendar-${version}-mac-universal.dmg`,
  ];
  const manifestName = "latest-mac.yml";
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "defcalendar-release-"));
    const files = await Promise.all(
      installers.map(async (url) => {
        await writeFile(join(directory, url), url);
        await writeFile(join(directory, `${url}.blockmap`), "blockmap");
        return { url, size: url.length, sha512: createHash("sha512").update(url).digest("base64") };
      }),
    );
    await writeFile(
      join(directory, manifestName),
      dump({ version, path: files[0].url, sha512: files[0].sha512, files }),
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("stages both Mac installers, their blockmaps and the update manifest", async () => {
    await verifyReleaseAssets("mac", version, directory);
    expect((await readdir(join(directory, "assets"))).toSorted()).toStrictEqual(
      [manifestName, ...installers, ...installers.map((name) => `${name}.blockmap`)].toSorted(),
    );
  });

  it("rejects a same-size installer with a different checksum", async () => {
    await writeFile(join(directory, installers[1]), "x".repeat(installers[1].length));
    await expect(verifyReleaseAssets("mac", version, directory)).rejects.toThrow(
      "invalid checksum",
    );
    await expect(readdir(join(directory, "assets"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an incomplete blockmap", async () => {
    await writeFile(join(directory, `${installers[1]}.blockmap`), "");
    await expect(verifyReleaseAssets("mac", version, directory)).rejects.toThrow("non-empty file");
  });
});

describe("release publication", () => {
  async function runPublication(releaseState: string, assetCount = 8, uploadStatus = "0") {
    const publish = workflow.jobs.publish.steps.find((step) => step.name === "Publish release");
    if (!publish?.run) {
      throw new Error("The release publication step is missing.");
    }

    const directory = await mkdtemp(join(tmpdir(), "defcalendar-publish-"));
    try {
      const assets = join(directory, "release-assets");
      await mkdir(assets);
      await Promise.all(
        Array.from({ length: assetCount }, (_, index) =>
          writeFile(join(assets, `asset-${index}`), "x"),
        ),
      );
      const script = `
gh() {
  case "$2" in
    view) printf '%s\\n' "$RELEASE_STATE"; [[ "$RELEASE_STATE" == true || "$RELEASE_STATE" == false ]];;
    list) printf 'v0.10.10\\n';;
    upload) printf 'UPLOADED\\n'; return "$UPLOAD_STATUS";;
    edit) printf 'PUBLISHED\\n';;
    create) printf '%s\\n' "$@";;
    *) return 99;;
  esac
}
${publish.run}`;
      return await runBash(
        script,
        {
          ...process.env,
          TAG: "v0.10.11",
          GITHUB_SHA: "example-commit",
          RELEASE_STATE: releaseState,
          UPLOAD_STATUS: uploadStatus,
        },
        directory,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  it("publishes only successful tag builds and uses the last public stable tag for notes", async () => {
    expect(workflow.jobs.publish.if).toBe("github.event_name == 'push'");
    expect(workflow.jobs.publish.needs).toBe("build");
    const { stdout } = await runPublication("release not found");
    const lines = stdout.trim().split(/\r?\n/);
    expect(lines.slice(0, 3)).toStrictEqual(["release", "create", "v0.10.11"]);
    expect(lines.filter((arg) => arg.startsWith("release-assets/"))).toHaveLength(8);
    expect(lines.slice(-5)).toStrictEqual([
      "--target",
      "example-commit",
      "--generate-notes",
      "--notes-start-tag",
      "v0.10.10",
    ]);
  });

  it("publishes an existing draft only after a successful upload", async () => {
    const { stdout } = await runPublication("true");
    expect(stdout.trim().split(/\r?\n/)).toStrictEqual(["UPLOADED", "PUBLISHED"]);
    await expect(runPublication("true", 8, "23")).rejects.toMatchObject({
      code: 23,
      stdout: "UPLOADED\n",
    });
  });

  it("stops when assets are missing or GitHub cannot be queried", async () => {
    await expect(runPublication("true", 7)).rejects.toMatchObject({ code: 1, stdout: "" });
    await expect(runPublication("HTTP 503")).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr: "HTTP 503\n",
    });
  });
});

describe("picomatch for build tooling", () => {
  const picomatch = require("picomatch") as (pattern: string) => (value: string) => boolean;

  it("preserves recursive source file globs", () => {
    const matches = picomatch("src/**/*.{ts,tsx}");
    expect(matches("src/renderer/components/calendar.tsx")).toBe(true);
    expect(matches("src/renderer/components/calendar.css")).toBe(false);
  });

  it.each(["+(draft)", "*(draft)"])("rejects repeated extglob %s", (pattern) => {
    expect(() => picomatch(pattern)).toThrow("Repeated extglobs are disabled");
  });
});
