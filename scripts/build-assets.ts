import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const output = process.argv[2] ?? "dist/ui";
mkdirSync(output, { recursive: true });
for (const file of [
  "index.html",
  "styles.css",
  "argent-icon.webp",
  "argent-app-icon-macos.png",
  "argent-app-icon-macos-dark.png",
  "argent-wordmark.webp",
  "turned-silver.webp",
])
  copyFileSync(`ui/${file}`, join(output, file));

cpSync("ui/icons", join(output, "icons"), { recursive: true });
cpSync("ui/fonts", join(output, "fonts"), { recursive: true });
