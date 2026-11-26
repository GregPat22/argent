import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readlink } from "node:fs/promises";
import { promisify } from "node:util";
import { DomainError } from "./domain.js";

export interface RecoveryOwner {
  instanceId: string;
  bootScope: string;
}

// A process group number is meaningful only in its boot and PID namespace.
// Keep machine identifiers out of events, logs and HTTP responses.
export async function recoveryOwner(
  instanceId: string,
): Promise<RecoveryOwner | undefined> {
  try {
    let boot: string;
    let namespace = "";
    if (process.platform === "darwin") {
      const result = await promisify(execFile)(
        "/usr/sbin/sysctl",
        ["-n", "kern.bootsessionuuid"],
        {
          timeout: 1000,
          maxBuffer: 1024,
          env: { LANG: "C" },
        },
      );
      boot = result.stdout.trim();
    } else if (process.platform === "linux") {
      boot = (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
      namespace = await readlink("/proc/self/ns/pid");
      if (!/^pid:\[\d+\]$/.test(namespace)) return undefined;
    } else return undefined;
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(boot))
      return undefined;
    return {
      instanceId,
      bootScope: createHash("sha256")
        .update([process.platform, boot.toLowerCase(), namespace].join("/"))
        .digest("hex"),
    };
  } catch {
    return undefined;
  }
}

export function requireAbsentAgentGroup(pgid: number): void {
  if (!Number.isSafeInteger(pgid) || pgid <= 1 || pgid > 0x7fffffff)
    throw new DomainError(
      409,
      "Invalid recorded process group. The workspace stays blocked.",
    );
  try {
    // Signal zero is an existence probe. Never terminate a group after restart.
    process.kill(-pgid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw new DomainError(
      409,
      "Argent could not inspect the recorded process group. The workspace stays blocked.",
    );
  }
  throw new DomainError(
    409,
    "The recorded process group still exists. The workspace stays blocked.",
  );
}
