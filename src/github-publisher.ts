import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rmdir,
  unlink,
  open,
  readdir,
  type FileHandle,
} from "node:fs/promises";
import { userInfo } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { DomainError, UncertainExecutionError } from "./domain.js";
import { directoryIdentity } from "./local-worktree-identity.js";
import { captureProcess } from "./process-group.js";
import { record } from "./repository-access.js";
import {
  publicationGraphQL,
  type PublicationRequest,
} from "./github-publication-api.js";

import {
  githubRepository,
  publicationBaseRef,
  publicationTitle,
  publicationNumber,
  PUBLICATION_MAX_COMMITS,
  type PublicationTarget,
} from "./publication-record.js";
export type { PublicationTarget } from "./publication-record.js";
export interface PublicationTransport {
  preflight(target: PublicationTarget): Promise<void>;
  push(
    worktree: string,
    target: PublicationTarget,
    beforePush: () => Promise<void>,
  ): Promise<void>;
  confirmHead(target: PublicationTarget): Promise<void>;
  createDraft(target: PublicationTarget): Promise<string>;
  verifyDraft(target: PublicationTarget, url: string): Promise<void>;
}

const invalid = () => new DomainError(400, "Invalid GitHub publication target");
const mismatch = () =>
  new DomainError(409, "GitHub does not match the reviewed publication");
const failed = () => new DomainError(502, "GitHub publication command failed");
const git = "/usr/bin/git";
const gitEnv = {
  PATH: "/usr/bin:/bin",
  LANG: "C",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_NO_LAZY_FETCH: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_ALLOW_PROTOCOL: "",
  GIT_OPTIONAL_LOCKS: "0",
};
const noHooks = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
];
const maxPack = 64 * 1024 * 1024;
const maxObjects = 100_000;
const maxExpanded = 256 * 1024 * 1024;
const sha = /^[a-f0-9]{40}$/;
function matches(value: unknown, re: RegExp): value is string {
  return typeof value === "string" && re.exec(value)?.[0] === value;
}
export function validatePublicationTarget(t: PublicationTarget): void {
  if (
    !t ||
    !githubRepository(t.repository) ||
    !matches(t.branch, /^argent\/[a-f0-9]{8}$/) ||
    !publicationBaseRef(t.baseBranch) ||
    t.baseBranch === t.branch ||
    !matches(t.headSha, sha) ||
    !matches(t.baseSha, sha) ||
    t.headSha === t.baseSha ||
    !publicationTitle(t.title) ||
    typeof t.body !== "string" ||
    !t.body.trim() ||
    Buffer.byteLength(t.body) > 60000 ||
    /[\x00-\x08\x0b-\x1f\x7f]/.test(t.body) ||
    Buffer.from(t.body).toString() !== t.body
  )
    throw invalid();
}

const repoQuery = `query PublicationRefs($owner:String!,$name:String!,$base:String!,$head:String!){
  repository(owner:$owner,name:$name){id nameWithOwner isFork
    base:ref(qualifiedName:$base){name target{__typename oid}}
    head:ref(qualifiedName:$head){name target{__typename oid}}
  }
}`;
const createMutation = `mutation PublicationDraft($repository:ID!,$base:String!,$head:String!,$title:String!,$body:String!){
  createPullRequest(input:{repositoryId:$repository,baseRefName:$base,headRefName:$head,title:$title,body:$body,draft:true}){
    pullRequest{url}
  }
}`;
const draftQuery = `query PublicationReceipt($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){id nameWithOwner isFork
    pullRequest(number:$number){number url state isDraft title body baseRefName baseRefOid headRefName headRefOid
      baseRepository{id nameWithOwner} headRepository{id nameWithOwner}
    }
  }
}`;

function pullNumber(t: PublicationTarget, url: unknown): number {
  const number = publicationNumber(url, t.repository);
  if (number === null) throw mismatch();
  return number;
}

async function installedGh(): Promise<string> {
  for (const path of [
    "/usr/bin/gh",
    "/opt/homebrew/bin/gh",
    "/usr/local/bin/gh",
  ]) {
    try {
      const actual = await realpath(path);
      if (
        actual !== path &&
        !actual.startsWith(dirname(dirname(path)) + "/Cellar/gh/")
      )
        continue;
      const stat = await lstat(actual);
      if (
        !stat.isFile() ||
        stat.mode & 0o022 ||
        ![0, process.getuid?.()].includes(stat.uid)
      )
        continue;
      await access(actual, constants.X_OK);
      return actual;
    } catch {
      /* Try another standard installation. */
    }
  }
  throw new DomainError(
    409,
    "Install GitHub CLI in a standard location and sign in to github.com",
  );
}

interface Commands {
  run: typeof captureProcess;
  gh: () => Promise<string>;
  request?: PublicationRequest;
}

// Keep open file descriptors: an occupied or replaced pathname never becomes
// a deletion claim. Unexpected files or directories preserve the scratch area.
class Scratch {
  private dirs = new Map<string, string>();
  private files = new Map<string, FileHandle>();
  constructor(readonly path: string) {}
  async rememberDir(dir: string) {
    this.dirs.set(dir, await directoryIdentity(dir));
  }
  async mkdir(name: string) {
    const path = join(this.path, name);
    await mkdir(path, { mode: 0o700 });
    await this.rememberDir(path);
  }
  async write(name: string, value: Buffer | string) {
    const path = join(this.path, name);
    const file = await open(path, "wx", 0o600);
    this.files.set(path, file);
    await file.writeFile(value);
  }
  async index(
    packBase: string,
    checksum: string,
    count: number,
    create: () => Promise<Buffer>,
  ) {
    const path = join(this.path, packBase + ".idx");
    await this.verify();
    const created = await create();
    if (created.toString("ascii") !== checksum + "\n") throw mismatch();
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size < 1072 ||
        stat.size > 4 * 1024 * 1024
      )
        throw mismatch();
      const bytes = await file.readFile();
      if (
        bytes.readUInt32BE(0) !== 0xff744f63 ||
        bytes.readUInt32BE(4) !== 2 ||
        bytes.readUInt32BE(8 + 255 * 4) !== count ||
        bytes.subarray(-40, -20).toString("hex") !== checksum ||
        createHash("sha1").update(bytes.subarray(0, -20)).digest("hex") !==
          bytes.subarray(-20).toString("hex")
      )
        throw mismatch();
      this.files.set(path, file);
    } catch (error) {
      await file.close();
      throw error;
    }
  }
  async verify() {
    const paths = [...this.dirs.keys(), ...this.files.keys()];
    for (const [path, identity] of this.dirs) {
      if ((await directoryIdentity(path)) !== identity) throw mismatch();
      const expected = paths
        .filter((p) => p !== path && dirname(p) === path)
        .map((p) => basename(p))
        .sort();
      if (
        JSON.stringify((await readdir(path)).sort()) !==
        JSON.stringify(expected)
      )
        throw mismatch();
    }
    for (const [path, file] of this.files) {
      const actual = await lstat(path, { bigint: true });
      const opened = await file.stat({ bigint: true });
      if (
        !actual.isFile() ||
        actual.nlink !== 1n ||
        opened.ino !== actual.ino ||
        opened.dev !== actual.dev
      )
        throw mismatch();
    }
  }
  async finish(remove: boolean) {
    try {
      if (remove) {
        await this.verify();
        for (const path of this.files.keys()) await unlink(path);
        for (const path of [...this.dirs.keys()].reverse()) await rmdir(path);
      }
    } finally {
      await Promise.all([...this.files.values()].map((file) => file.close()));
    }
  }
}
async function scratch<T>(use: (s: Scratch) => Promise<T>): Promise<T> {
  // The short system temp path also fits macOS's Unix socket pathname limit.
  const s = new Scratch(
    await mkdtemp(join(await realpath("/tmp"), "argent-publish-")),
  );
  await s.rememberDir(s.path);
  let uncertain = false;
  try {
    return await use(s);
  } catch (error) {
    uncertain = error instanceof UncertainExecutionError;
    throw error;
  } finally {
    await s.finish(!uncertain);
  }
}

export class GitHubPublisher implements PublicationTransport {
  private readonly bindings = new WeakMap<
    PublicationTarget,
    { repositoryId: string; target: PublicationTarget }
  >();
  constructor(
    private readonly commands: Commands = {
      run: captureProcess,
      gh: installedGh,
    },
  ) {}

  private async run(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    maxBuffer = 256 * 1024,
  ) {
    try {
      return await this.commands.run(
        command,
        args,
        { cwd, env },
        { maxBuffer, timeoutMs: 60000 },
      );
    } catch (error) {
      if (error instanceof UncertainExecutionError) throw error;
      throw failed();
    }
  }

  private async credential() {
    const command = await this.commands.gh();
    const env = {
      PATH: gitEnv.PATH,
      LANG: "C",
      HOME: userInfo().homedir,
      GH_HOST: "github.com",
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      GH_NO_EXTENSION_UPDATE_NOTIFIER: "1",
    };
    // Read the active developer sign-in only. No ambient token, repo selection,
    // proxy, trace, editor, pager or Git configuration is imported.
    const bytes = await this.run(
      command,
      ["auth", "token", "--hostname", "github.com"],
      "/",
      env,
      4096,
    );
    const token = bytes.toString("ascii").replace(/\r?\n$/, "");
    if (
      !Buffer.from(bytes.toString("ascii"), "ascii").equals(bytes) ||
      !matches(token, /^[A-Za-z0-9_.-]{8,4000}$/)
    )
      throw new DomainError(
        409,
        "GitHub CLI did not supply a github.com sign-in",
      );
    return { command, token };
  }

  private async graphql(
    query: string,
    fields: Record<string, string | number>,
  ) {
    const { command, token } = await this.credential();
    // Only the credential lookup reads the developer's gh configuration. The
    // CLI formats its GraphQL request through a private single-use socket.
    const bytes = await scratch(async (s) => {
      const socket = join(s.path, "api.sock");
      await s.write(
        "config.yml",
        "http_unix_socket: " + JSON.stringify(socket) + "\n",
      );
      return publicationGraphQL({
        directory: s.path,
        socket,
        query,
        fields,
        token,
        invoke: (args, env) => this.run(command, args, s.path, env),
        ...(this.commands.request ? { request: this.commands.request } : {}),
      });
    });
    try {
      const result = record(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
      if (Object.hasOwn(result, "errors")) throw mismatch();
      return record(result.data);
    } catch {
      throw failed();
    }
  }

  private async refs(
    t: PublicationTarget,
    pushed: boolean,
    expectedId?: string,
  ) {
    const [owner, name] = t.repository.split("/") as [string, string];
    const data = await this.graphql(repoQuery, {
      owner,
      name,
      base: `refs/heads/${t.baseBranch}`,
      head: `refs/heads/${t.branch}`,
    });
    const repo = record(data.repository);
    if (
      !matches(repo.id, /^[A-Za-z0-9_=:-]{1,200}$/) ||
      (expectedId !== undefined && expectedId !== repo.id) ||
      repo.nameWithOwner !== t.repository ||
      repo.isFork !== false
    )
      throw mismatch();
    const checkRef = (input: unknown, name: string, oid: string) => {
      const ref = record(input);
      const target = record(ref.target);
      if (
        ref.name !== name ||
        target.__typename !== "Commit" ||
        target.oid !== oid
      )
        throw mismatch();
    };
    checkRef(repo.base, t.baseBranch, t.baseSha);
    if (pushed) checkRef(repo.head, t.branch, t.headSha);
    else if (repo.head !== null)
      throw new DomainError(409, "The GitHub workspace branch already exists");
    return repo.id;
  }

  async preflight(target: PublicationTarget) {
    validatePublicationTarget(target);
    const t = Object.freeze({ ...target });
    const repositoryId = await this.refs(t, false);
    this.bindings.set(target, { repositoryId, target: t });
  }

  private binding(target: PublicationTarget) {
    const b = this.bindings.get(target);
    if (
      !b ||
      (Object.keys(b.target) as (keyof PublicationTarget)[]).some(
        (k) => target[k] !== b.target[k],
      )
    )
      throw new DomainError(
        409,
        "The GitHub publication requires a fresh preflight",
      );
    return b;
  }

  async push(
    worktree: string,
    target: PublicationTarget,
    beforePush: () => Promise<void>,
  ) {
    const binding = this.binding(target);
    const t = binding.target;
    if (!isAbsolute(worktree) || (await realpath(worktree)) !== worktree)
      throw mismatch();
    const objectBytes = await this.run(
      git,
      [
        ...noHooks,
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "objects",
      ],
      worktree,
      gitEnv,
      8192,
    );
    const objects = new TextDecoder("utf-8", { fatal: true })
      .decode(objectBytes)
      .replace(/\n$/, "");
    if (
      !isAbsolute(objects) ||
      /[\x00-\x1f\x7f]/.test(objects) ||
      (await realpath(objects)) !== objects ||
      !(await lstat(objects)).isDirectory()
    )
      throw mismatch();
    await scratch(async (s) => {
      const dir = s.path;
      for (const child of ["refs", "objects", "objects/pack"])
        await s.mkdir(child);
      await s.write("HEAD", t.headSha + "\n");
      await s.write("shallow", t.baseSha + "\n");
      const localEnv = { ...gitEnv, GIT_DIR: dir, HOME: dir };
      // The object reader sees only our detached HEAD and shallow boundary.
      // It has no credentials or transports. Omit older, unrelated and dangling
      // objects; do not reuse source pack data or reachability bitmaps.
      const readerEnv = { ...localEnv, GIT_OBJECT_DIRECTORY: objects };
      const manifest = (
        await this.run(
          git,
          [
            ...noHooks,
            "-c",
            "core.commitGraph=false",
            "rev-list",
            "--objects",
            "--no-object-names",
            "--filter=blob:limit=16777217",
            "--filter-print-omitted",
            "HEAD",
          ],
          dir,
          readerEnv,
          42 * maxObjects,
        )
      )
        .toString("ascii")
        .trimEnd()
        .split("\n");
      if (
        manifest.length > maxObjects ||
        manifest.some((oid) => !matches(oid, sha))
      )
        throw new DomainError(
          413,
          "The publication object set exceeds its limits",
        );
      const pack = await this.run(
        git,
        [
          ...noHooks,
          "-c",
          "pack.threads=1",
          "-c",
          "core.commitGraph=false",
          "pack-objects",
          "--stdout",
          "--all",
          "--no-use-bitmap-index",
          "--no-reuse-delta",
          "--no-reuse-object",
          "--window=0",
        ],
        dir,
        readerEnv,
        maxPack,
      );
      if (pack.length < 32 || pack.toString("ascii", 0, 4) !== "PACK")
        throw mismatch();
      const checksum = createHash("sha1")
        .update(pack.subarray(0, -20))
        .digest("hex");
      if (pack.subarray(-20).toString("hex") !== checksum) throw mismatch();
      const packBase = `objects/pack/pack-${checksum}`;
      const count = pack.readUInt32BE(8);
      if (
        pack.readUInt32BE(4) !== 2 ||
        count !== manifest.length ||
        count < 1 ||
        count > maxObjects
      )
        throw mismatch();
      await s.write(packBase + ".pack", pack);
      await s.index(packBase, checksum, count, () =>
        this.run(
          git,
          [
            ...noHooks,
            "index-pack",
            "--index-version=2",
            "--no-rev-index",
            join(dir, packBase + ".pack"),
          ],
          dir,
          localEnv,
        ),
      );
      const sizes = (
        await this.run(
          git,
          [
            ...noHooks,
            "cat-file",
            "--batch-all-objects",
            "--batch-check=%(objectsize)",
          ],
          dir,
          localEnv,
          16 * maxObjects,
        )
      )
        .toString("ascii")
        .trimEnd()
        .split("\n");
      let expanded = 0;
      if (
        sizes.length !== count ||
        sizes.some(
          (size) =>
            !matches(size, /^[0-9]{1,10}$/) ||
            (expanded += Number(size)) > maxExpanded,
        )
      )
        throw mismatch();
      // Also reject unreachable objects: every byte in this repo must belong
      // to the reviewed history or the base snapshot already on the remote.
      const fsck = await this.run(
        git,
        [
          ...noHooks,
          "fsck",
          "--strict",
          "--full",
          "--unreachable",
          "--no-reflogs",
        ],
        dir,
        localEnv,
      );
      if (fsck.length) throw mismatch();
      const history = (
        await this.run(
          git,
          [
            ...noHooks,
            "rev-list",
            "--parents",
            `--max-count=${PUBLICATION_MAX_COMMITS + 2}`,
            t.headSha,
          ],
          dir,
          localEnv,
          8192,
        )
      )
        .toString("ascii")
        .trimEnd()
        .split("\n");
      if (
        history.length < 2 ||
        history.length > PUBLICATION_MAX_COMMITS + 1 ||
        history.at(-1) !== t.baseSha ||
        history[0]?.split(" ")[0] !== t.headSha ||
        history.slice(0, -1).some((line, i) => {
          const [oid, parent, ...extra] = line.split(" ");
          return (
            !matches(oid, sha) ||
            extra.length !== 0 ||
            parent !== history[i + 1]?.split(" ")[0]
          );
        })
      )
        throw mismatch();
      await this.refs(t, false, binding.repositoryId);
      const { token } = await this.credential();
      const ref = `refs/heads/${t.branch}`;
      const url = `https://github.com/${t.repository}.git`;
      await s.verify();
      await beforePush();
      // Local review can take time. Recheck the bare repository at dispatch.
      await s.verify();
      const pushed = await this.run(
        git,
        [
          ...noHooks,
          "-c",
          "credential.helper=",
          "-c",
          "http.followRedirects=false",
          "-c",
          "http.sslVerify=true",
          "push",
          "--porcelain",
          "--no-verify",
          "--no-follow-tags",
          "--no-signed",
          "--recurse-submodules=no",
          `--force-with-lease=${ref}:`,
          "--",
          url,
          `${t.headSha}:${ref}`,
        ],
        dir,
        {
          ...localEnv,
          GIT_ALLOW_PROTOCOL: "https",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: `http.${url}.extraHeader`,
          GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from("x-access-token:" + token).toString("base64")}`,
        },
      );
      const updates = pushed
        .toString("utf8")
        .split("\n")
        .filter((line) => line.includes("\t"));
      if (
        updates.length !== 1 ||
        updates[0] !== `*\t${t.headSha}:${ref}\t[new branch]`
      )
        throw mismatch();
    });
  }

  async confirmHead(target: PublicationTarget) {
    const b = this.binding(target);
    await this.refs(b.target, true, b.repositoryId);
  }

  async createDraft(target: PublicationTarget) {
    const { repositoryId, target: t } = this.binding(target);
    await this.refs(t, true, repositoryId);
    const data = await this.graphql(createMutation, {
      repository: repositoryId,
      base: t.baseBranch,
      head: t.branch,
      title: t.title,
      body: t.body,
    });
    const url = record(record(data.createPullRequest).pullRequest).url;
    pullNumber(t, url);
    return url as string;
  }

  async verifyDraft(target: PublicationTarget, url: string) {
    const { repositoryId, target: t } = this.binding(target);
    const number = pullNumber(t, url);
    const [owner, name] = t.repository.split("/") as [string, string];
    const data = await this.graphql(draftQuery, { owner, name, number });
    const repo = record(data.repository);
    const pr = record(repo.pullRequest);
    if (
      repo.id !== repositoryId ||
      repo.nameWithOwner !== t.repository ||
      repo.isFork !== false ||
      pr.number !== number ||
      pr.url !== url ||
      pr.state !== "OPEN" ||
      pr.isDraft !== true ||
      pr.title !== t.title ||
      pr.body !== t.body ||
      pr.baseRefName !== t.baseBranch ||
      pr.baseRefOid !== t.baseSha ||
      pr.headRefName !== t.branch ||
      pr.headRefOid !== t.headSha ||
      [pr.baseRepository, pr.headRepository].some((candidate) => {
        const r = record(candidate);
        return r.id !== repositoryId || r.nameWithOwner !== t.repository;
      })
    )
      throw mismatch();
  }
}
