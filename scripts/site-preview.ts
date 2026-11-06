import { createReadStream, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};
const filename = `Argent-${version}-macos-arm64.zip`;
const files = new Map<string, { path: string; type: string }>([
  [
    "/",
    { path: resolve("website/index.html"), type: "text/html; charset=utf-8" },
  ],
  ["/styles.css", { path: resolve("website/styles.css"), type: "text/css" }],
  [
    "/prototype.png",
    {
      path: resolve(".data/screenshots/argent-desktop.png"),
      type: "image/png",
    },
  ],
  [
    `/downloads/${filename}`,
    { path: resolve("release", filename), type: "application/zip" },
  ],
  [
    `/downloads/${filename}.sha256`,
    { path: resolve("release", `${filename}.sha256`), type: "text/plain" },
  ],
]);
for (const file of files.values()) statSync(file.path);
const server = createServer((request, response) => {
  const route = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const file = files.get(route);
  if (!file || !["GET", "HEAD"].includes(request.method ?? "")) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const size = statSync(file.path).size;
  response.writeHead(200, {
    "Content-Type": file.type,
    "Content-Length": size,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(file.path);
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
});
server.listen(4320, "127.0.0.1", () =>
  console.log("Argent download preview: http://127.0.0.1:4320"),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => server.close());
