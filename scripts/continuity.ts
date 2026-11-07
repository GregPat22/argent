import { resolve } from "node:path";
import { DomainError } from "../src/domain.js";
import { exportHistory } from "../src/continuity-export.js";
import { readHistoryFile, writeHistoryFile } from "../src/continuity-files.js";
import { ContinuityStore } from "../src/continuity-store.js";
import {
  CONTINUITY_LIMITS,
  decodeHistory,
  historicalView,
} from "../src/continuity.js";

const usage = `Offline Argent history (all work remains simulated):
  export --database PATH --workspaces PATH --workspace UUID --out PATH [--include-text]
  inspect --bundle PATH
  restore --bundle PATH --history PATH
  list --history PATH [--before SHA256] [--limit 1..100]
  show --history PATH --id SHA256

Use canonical absolute paths and existing private (700) output/history directories.
Export defaults to metadata only. --include-text selects private task/log text and
fixed simulation artifacts. Review text for secrets; marker detection is incomplete.
Inspect/show explicitly print selected content. Restore never resumes execution.`;

function argumentsFor(args: string[]): {
  command: string;
  options: Map<string, string>;
} {
  const command = args[0] ?? "help";
  const allowed: Record<string, string[]> = {
    export: ["database", "workspaces", "workspace", "out", "include-text"],
    inspect: ["bundle"],
    restore: ["bundle", "history"],
    list: ["history", "before", "limit"],
    show: ["history", "id"],
    help: [],
  };
  if (!Object.hasOwn(allowed, command))
    throw new DomainError(400, "Unknown history command");
  const options = new Map<string, string>();
  for (let index = 1; index < args.length; index++) {
    const arg = args[index]!;
    const key = arg.startsWith("--") ? arg.slice(2) : "";
    if (!allowed[command]!.includes(key) || options.has(key))
      throw new DomainError(400, "Invalid or duplicate history option");
    const value = key === "include-text" ? "true" : args[++index];
    if (!value || value.startsWith("--"))
      throw new DomainError(400, "History option requires a value");
    options.set(key, value);
  }
  return { command, options };
}

let history: ContinuityStore | undefined;
try {
  const { command, options } = argumentsFor(process.argv.slice(2));
  const required = (key: string): string => {
    const value = options.get(key);
    if (!value) throw new DomainError(400, "Missing required history option");
    return value;
  };
  const path = (key: string): string => resolve(required(key));
  const bundle = () => readHistoryFile(path("bundle"), CONTINUITY_LIMITS.bytes);
  let result: unknown;
  switch (command) {
    case "help":
      console.log(usage);
      break;
    case "export": {
      const content = exportHistory(
        path("database"),
        path("workspaces"),
        required("workspace"),
        options.has("include-text"),
      );
      const decoded = decodeHistory(Buffer.from(content));
      writeHistoryFile(path("out"), content);
      result = {
        id: decoded.sha256,
        simulation: true,
        textIncluded: decoded.payload.textIncluded,
        runs: decoded.payload.runs.length,
        omissions: decoded.payload.omissions,
      };
      break;
    }
    case "inspect":
      result = historicalView(decodeHistory(bundle()));
      break;
    case "restore": {
      const bytes = bundle();
      decodeHistory(bytes);
      history = new ContinuityStore(path("history"));
      result = history.restore(bytes);
      break;
    }
    case "list":
      history = new ContinuityStore(path("history"), true);
      result = history.list(
        Number(options.get("limit") ?? 50),
        options.get("before"),
      );
      break;
    case "show":
      history = new ContinuityStore(path("history"), true);
      result = history.show(required("id"));
      break;
  }
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    error instanceof DomainError ? error.message : "History command failed",
  );
  process.exitCode = 1;
} finally {
  history?.close();
}
