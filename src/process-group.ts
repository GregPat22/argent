import {
  execFile,
  spawn,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { UncertainExecutionError } from "./domain.js";

const exec = promisify(execFile);

// Only inspect groups created by this live supervisor. Never signal a PID read
// from an old database record: it may have been reused after a restart.
async function groupIsLive(pid: number | undefined): Promise<boolean> {
  if (!pid) return false;
  try {
    process.kill(-pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw new UncertainExecutionError();
  }
  // An orphaned zombie can remain until init reaps it, but cannot execute or
  // write files. ps is used only for this distinction; no command text is read.
  try {
    const { stdout } = await exec("/bin/ps", ["-axo", "pgid=,stat="], {
      env: { PATH: "/usr/bin:/bin", LANG: "C" },
      timeout: 1000,
      maxBuffer: 4 << 20,
    });
    return stdout.split("\n").some((line) => {
      const [group, state] = line.trim().split(/\s+/);
      return Number(group) === pid && state && !state.startsWith("Z");
    });
  } catch {
    throw new UncertainExecutionError();
  }
}

function signalGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH")
      throw new UncertainExecutionError();
  }
}

/** Owns termination independently of the group leader's exit and pipe closure. */
export function launchProcess(
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
  signal?: AbortSignal,
  graceMs = 3000,
) {
  signal?.throwIfAborted();
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = new Promise<{ code: number | null; error?: Error }>(
    (resolve) => {
      child.once("error", (error) => resolve({ code: null, error }));
      child.once("close", (code) => resolve({ code }));
    },
  );
  let stopping: Promise<void> | undefined;
  function stop(): Promise<void> {
    stopping ??= (async () => {
      try {
        if (!(await groupIsLive(child.pid))) return;
        signalGroup(child.pid, "SIGTERM");
        const deadline = Date.now() + graceMs;
        while (Date.now() < deadline) {
          if (!(await groupIsLive(child.pid))) return;
          await delay(Math.min(25, Math.max(1, deadline - Date.now())));
        }
        // Do not cancel escalation merely because the leader has exited.
        signalGroup(child.pid, "SIGKILL");
        const killedBy = Date.now() + 2000;
        while (await groupIsLive(child.pid)) {
          if (Date.now() >= killedBy) throw new UncertainExecutionError();
          await delay(25);
        }
      } finally {
        // A process escaping the group must not keep our pipe readers blocked.
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
      }
    })();
    return stopping;
  }
  const abort = () => {
    void stop().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  return {
    child,
    exited,
    stop,
    async dispose(): Promise<void> {
      signal?.removeEventListener("abort", abort);
      await stop();
      await exited;
    },
  };
}
