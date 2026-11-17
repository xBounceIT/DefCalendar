const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { copyFile, mkdir, readFile, stat } = require("node:fs/promises");
const { join } = require("node:path");
const { load } = require("js-yaml");

async function verifyReleaseAssets(platform, version, directory) {
  const windows = platform === "win";
  if (!windows && platform !== "mac") {
    throw new Error(`Unsupported release platform: ${platform}`);
  }

  const installers = windows
    ? [`DefCalendar-Setup-${version}.exe`]
    : [`DefCalendar-${version}-mac-universal.zip`, `DefCalendar-${version}-mac-universal.dmg`];
  const manifestName = windows ? "latest.yml" : "latest-mac.yml";
  const manifest = load(await readFile(join(directory, manifestName), "utf8"));
  if (
    manifest?.version !== version ||
    manifest.path !== installers[0] ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== installers.length
  ) {
    throw new Error(`${manifestName} does not describe the expected ${version} installers`);
  }

  for (const name of installers) {
    const file = join(directory, name);
    const info = manifest.files.find((entry) => entry?.url === name);
    const installer = await stat(file);
    if (!info || !installer.isFile() || installer.size === 0 || info.size !== installer.size) {
      throw new Error(`${manifestName} has missing or invalid size information for ${name}`);
    }

    const hash = createHash("sha512");
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk);
    }
    if (
      hash.digest("base64") !== info.sha512 ||
      (name === manifest.path && manifest.sha512 !== info.sha512)
    ) {
      throw new Error(`${manifestName} has an invalid checksum for ${name}`);
    }
    const blockmap = await stat(`${file}.blockmap`);
    if (!blockmap.isFile() || blockmap.size === 0) {
      throw new Error(`${name}.blockmap is not a non-empty file`);
    }
  }

  const destination = join(directory, "assets");
  await mkdir(destination, { recursive: true });
  const assets = [manifestName, ...installers, ...installers.map((name) => `${name}.blockmap`)];
  await Promise.all(assets.map((name) => copyFile(join(directory, name), join(destination, name))));
}

module.exports = { verifyReleaseAssets };

if (require.main === module) {
  const { version } = require("../../package.json");
  verifyReleaseAssets(process.argv[2], version, "release").catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
