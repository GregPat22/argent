// Run after changing the source artwork or the Icon Composer document.
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const brand = "website/public/brand/argent-";
const mark = brand + "icon-source.png";
const document = "ui/Argent.icon";
const xcode = execFileSync("xcode-select", ["-p"], { encoding: "utf8" }).trim();
const ictool = join(
  xcode,
  "../Applications/Icon Composer.app/Contents/Executables/ictool",
);

for (const [name, widths] of [
  ["icon", [96, 192]],
  ["wordmark", [800, 1600]],
]) {
  for (const width of widths) {
    await sharp(brand + name + "-source.png")
      .resize(width)
      .webp({ quality: 95, alphaQuality: 100 })
      .toFile(brand + name + "-" + width + ".webp");
  }
}
await copyFile(brand + "icon-96.webp", "ui/argent-icon.webp");
await copyFile(brand + "wordmark-800.webp", "ui/argent-wordmark.webp");
await sharp(mark).resize(64).png().toFile("website/src/app/icon.png");

// Narrow reflections disappear at Finder list sizes. Keep the same A with
// darker faces on a simple pearl tile so the counter survives downsampling.
const smallForeground = await sharp(mark)
  .linear([0.42, 0.42, 0.42, 1], [22, 22, 22, 0])
  .resize(48)
  .png()
  .toBuffer();
const smallTile =
  Buffer.from(`<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="pearl" x2="0" y2="1"><stop stop-color="#eef0f1"/><stop offset="1" stop-color="#c3c9cf"/></linearGradient></defs>
  <rect x="5" y="5" width="54" height="54" rx="12" fill="url(#pearl)"/>
</svg>`);
await sharp(smallTile)
  .composite([{ input: smallForeground, left: 8, top: 8 }])
  .png()
  .toFile("ui/macos/argent-small.png");

// ICO directory entries point to individual PNGs so small tabs use a native size.
const sizes = [16, 32, 48];
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
const images = [];
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const png = await sharp(mark).resize(size).sharpen().png().toBuffer();
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(png.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  images.push(png);
  offset += png.length;
}
await writeFile(
  "website/src/app/favicon.ico",
  Buffer.concat([directory, ...images]),
);

await sharp(mark)
  .resize(1024)
  .png()
  .toFile(join(document, "Assets/argent-app-icon.png"));
await sharp(mark)
  .resize(850)
  .extend({ top: 80, bottom: 94, left: 87, right: 87, background: "#16191f" })
  .flatten({ background: "#16191f" })
  .png()
  .toFile("ui/argent-app-icon.png");
await sharp("ui/argent-app-icon.png")
  .resize(180)
  .png()
  .toFile("website/src/app/apple-icon.png");

const scratch = await mkdtemp(join(tmpdir(), "argent-artwork-"));
try {
  for (const [appearance, file] of [
    ["Default", "argent-app-icon-macos.png"],
    ["Dark", "argent-app-icon-macos-dark.png"],
  ]) {
    const output = join(scratch, appearance + ".png");
    execFileSync(ictool, [
      document,
      "--export-image",
      "--output-file",
      output,
      "--platform",
      "macOS",
      "--rendition",
      appearance,
      "--width",
      "1024",
      "--height",
      "1024",
      "--scale",
      "1",
    ]);
    // Dock PNGs and classic ICNS need the safe area that the modern system adds itself.
    await sharp(output)
      .resize(824)
      .extend({
        top: 100,
        left: 100,
        right: 100,
        bottom: 100,
        background: "#00000000",
      })
      .png()
      .toFile(join("ui", file));
  }
  execFileSync(
    "xcrun",
    [
      "actool",
      document,
      "--compile",
      scratch,
      "--platform",
      "macosx",
      "--target-device",
      "mac",
      "--minimum-deployment-target",
      "12.0",
      "--app-icon",
      "Argent",
      "--output-partial-info-plist",
      join(scratch, "Info.plist"),
    ],
    { stdio: "inherit" },
  );
  await copyFile(join(scratch, "Assets.car"), "ui/macos/Assets.car");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
