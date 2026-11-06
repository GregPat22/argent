import { copyFileSync, cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/ui", { recursive: true });
for (const file of ["index.html", "styles.css", "argent-icon.webp"])
  copyFileSync(`ui/${file}`, `dist/ui/${file}`);

cpSync("ui/icons", "dist/ui/icons", { recursive: true });
