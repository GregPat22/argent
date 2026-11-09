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
  const closed = new Promise<{ code: number | null; error?: Error }>(
    (resolve) => {
      child.once("error", (error) => resolve({ code: null, error }));
      child.once("close", (code) => resolve({ code }));
    },
  );
  let rejectStop: (error: unknown) => void = () => {};
  const stopFailure = new Promise<never>((_resolve, reject) => {
    rejectStop = reject;
  });
  const exited = Promise.race([closed, stopFailure]);
  // A stop may fail while a generator is suspended at a yield. Keep that
  // rejection observed until its owner resumes and disposes the execution.
  void exited.catch(() => {});
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
    })().catch((error: unknown) => {
      // A failed liveness inspection must not leave capture waiting forever for
      // a close event from the very process whose termination is uncertain.
      try {
        signalGroup(child.pid, "SIGKILL");
      } catch {
        /* still uncertain */
      }
      rejectStop(error);
      throw error;
    });
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

/** Collect bounded output without blocking service requests or lease heartbeats. */
export async function captureProcess(
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
  limits: {
    signal?: AbortSignal | undefined;
    maxBuffer?: number;
    timeoutMs?: number;
    allowedExitCodes?: number[];
  } = {},
): Promise<Buffer> {
  const controller = new AbortController();
  const signal = limits.signal
    ? AbortSignal.any([limits.signal, controller.signal])
    : controller.signal;
  const timer = setTimeout(
    () => controller.abort("process_timeout"),
    limits.timeoutMs ?? 30000,
  );
  const output: Buffer[] = [];
  let bytes = 0;
  let execution: ReturnType<typeof launchProcess> | undefined;
  try {
    execution = launchProcess(command, args, options, signal, 100);
    execution.child.stdin.on("error", () => {});
    execution.child.stdin.end();
    execution.child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (limits.maxBuffer ?? 1 << 20))
        controller.abort("process_output_limit");
      else output.push(chunk);
    });
    // Error output is deliberately discarded: configuration and repository
    // errors may contain secrets. Report a fixed command failure instead.
    execution.child.stderr.resume();
    const result = await execution.exited;
    signal.throwIfAborted();
    if (
      result.error ||
      result.code === null ||
      !(limits.allowedExitCodes ?? [0]).includes(result.code)
    )
      throw new Error("Process failed");
    return Buffer.concat(output);
  } finally {
    clearTimeout(timer);
    await execution?.dispose();
  }
}
