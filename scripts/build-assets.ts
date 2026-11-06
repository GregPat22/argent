import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist/ui", { recursive: true });
for (const file of ["index.html", "styles.css"])
  copyFileSync(`ui/${file}`, `dist/ui/${file}`);
