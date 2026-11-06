import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { requireInteger } from "./domain.js";

export function dataPaths(): { database: string; workspaces: string } {
  const directory = resolve(process.env.PLATFORM_DATA_DIR ?? ".data");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return {
    database: join(directory, "platform.sqlite"),
    workspaces: join(directory, "workspaces"),
  };
}

export function apiToken(): string {
  const token = process.env.PLATFORM_API_TOKEN;
  if (!token || token.length < 32 || token.startsWith("replace-")) {
    throw new Error(
      "Set PLATFORM_API_TOKEN to a unique token of at least 32 characters",
    );
  }
  return token;
}

export function apiPort(): number {
  return requireInteger(
    Number(process.env.PLATFORM_PORT ?? 4310),
    "PLATFORM_PORT",
    0,
    65535,
  );
}
