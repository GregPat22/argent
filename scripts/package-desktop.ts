import { packager } from "@electron/packager";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error(
    "This prototype packaging recipe currently targets macOS Apple Silicon.",
  );
}
const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
  devDependencies: { electron: string };
};
mkdirSync(".data", { recursive: true });
const stage = mkdtempSync(resolve(".data", "package-"));
// Generate the native icon from the same artwork used by the development Dock.
// Keep intermediates outside the staged application so they are not shipped.
const iconset = `${stage}.iconset`;
const icon = `${stage}.icns`;
mkdirSync(iconset);
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const pixels = String(size * scale);
    const suffix = scale === 2 ? "@2x" : "";
    execFileSync("/usr/bin/sips", [
      "--resampleHeightWidth",
      pixels,
      pixels,
      resolve(
        size * scale <= 32
          ? "ui/macos/argent-small.png"
          : "ui/argent-app-icon-macos.png",
      ),
      "--out",
      join(iconset, `icon_${size}x${size}${suffix}.png`),
    ]);
  }
}
execFileSync("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", icon]);
execFileSync(
  process.execPath,
  [
    resolve("node_modules/typescript/bin/tsc"),
    "--project",
    "tsconfig.desktop.json",
    "--outDir",
    join(stage, "dist"),
  ],
  { stdio: "inherit" },
);
execFileSync(
  process.execPath,
  ["scripts/build-assets.ts", join(stage, "dist/ui")],
  {
    stdio: "inherit",
  },
);
cpSync("LICENSE", join(stage, "LICENSE"));
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify(
    {
      name: "argent",
      productName: "Argent",
      version: manifest.version,
      main: "dist/src/desktop/main.js",
      type: "module",
      license: "MIT",
    },
    null,
    2,
  ),
);
const output = await packager({
  dir: stage,
  out: resolve("release"),
  name: "Argent",
  platform: "darwin",
  arch: "arm64",
  electronVersion: manifest.devDependencies.electron,
  appBundleId: "dev.argent.desktop",
  appVersion: manifest.version,
  icon,
  extendInfo: { CFBundleIconName: "Argent" },
  extraResource: resolve("ui/macos/Assets.car"),
  afterExtract: [
    ({ buildPath }) => {
      const notices = join(stage, "licenses", "electron");
      mkdirSync(notices, { recursive: true });
      for (const name of ["LICENSE", "LICENSES.chromium.html"]) {
        cpSync(join(buildPath, name), join(notices, name));
      }
    },
  ],
  overwrite: true,
  asar: false,
  download: {
    cacheRoot:
      process.env.ELECTRON_CACHE ?? "/private/tmp/argent-electron-cache",
  },
});
const application = join(output[0]!, "Argent.app");
const name = `Argent-${manifest.version}-macos-arm64`;
const archive = resolve("release", `${name}.zip`);
execFileSync("/usr/bin/ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  application,
  archive,
]);
const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(`${archive}.sha256`, `${digest}  ${name}.zip\n`);
console.log(
  JSON.stringify(
    { application, archive, sha256: digest, signed: false, notarized: false },
    null,
    2,
  ),
);
