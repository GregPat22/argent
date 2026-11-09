import { copyFileSync, cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/ui", { recursive: true });
for (const file of [
  "index.html",
  "styles.css",
  "argent-icon.webp",
  "argent-wordmark.webp",
])
  copyFileSync(`ui/${file}`, `dist/ui/${file}`);

cpSync("ui/icons", "dist/ui/icons", { recursive: true });
cpSync("ui/fonts", "dist/ui/fonts", { recursive: true });
