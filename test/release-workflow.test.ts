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
const execFileAsync = promisify(execFile);

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
  const shell =
    process.platform === "win32"
      ? join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe")
      : "/bin/bash";
  const script = `npm() { printf 'ARG:%s\\n' "$@"; return ${exitCode}; }\n${macBuild.run}`;
  const { stdout, stderr } = await execFileAsync(
    shell,
    ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script],
    { env, timeout: 10_000 },
  );
  const args = stdout
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.startsWith("ARG:"))
    .map((line) => line.slice(4));
  return { args, stdout, stderr };
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
});
