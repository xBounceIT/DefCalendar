import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

interface ReleaseStep {
  name?: string;
  if?: string;
  shell?: string;
  run?: string;
  env?: Record<string, string>;
}

interface ReleaseWorkflow {
  jobs: { build: { steps: ReleaseStep[] } };
}

const { load } = createRequire(import.meta.url)("js-yaml") as {
  load(source: string): ReleaseWorkflow;
};
const workflow = load(
  readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"),
);
const macBuild = workflow.jobs.build.steps.find(
  (step) => step.name === "Build and publish macOS universal assets",
);
const macVerify = workflow.jobs.build.steps.find(
  (step) => step.name === "Verify macOS universal binaries",
);
const execFileAsync = promisify(execFile);
const shell =
  process.platform === "win32"
    ? join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe")
    : "/bin/bash";

function runBash(script: string, env: NodeJS.ProcessEnv) {
  return execFileAsync(shell, ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script], {
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
      "dist:publish",
      "--",
      "--mac",
      "--universal",
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
      "dist:publish",
      "--",
      "--mac",
      "--universal",
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
      /^\$\{\{ secrets\.MAC_CSC_LINK != '' \}\}$/,
    );
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
