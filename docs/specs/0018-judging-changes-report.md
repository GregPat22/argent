# Judging-changes report: whether a commit changed what judges it

Status: **in development**, accepted 16 November 2026. It is work-queue item 4 in the [roadmap](../../ROADMAP.md#work-queue):
it starts after [L1.4](0013-local-mvp.md#l14-setup-run-and-test-actions) shows
its first passed, failed or stale result in the desktop app, and it comes before
the draft pull request (L1.5). The detailed acceptance contract and a dedicated
security review are recorded here before any code.

## Product decision

L1.4 reads the `setup` and `test` commands from the workspace's base commit, so
a commit cannot change which commands Argent runs. It can still change what
those commands do. `npm run check` runs whatever the candidate commit's
`package.json` says `check` is; the tests are the files in that commit; `setup`
installs the dependencies that commit names. A passed result therefore says
that the named commands passed on a known commit. It does not say whether that
commit also changed what produced the pass.

The complete text review before consent already shows every changed line. It
does not point at the few changes that matter for the result, and a deleted
test or a changed script is easy to miss in a long diff.

The judging-changes report closes that gap. For one exact commit, Argent
states whether the commit changed what judges it, in three groups, next to the
check result and before the commands run. It is information for the person who
decides. It makes no accusation: adding a dependency or rewriting a test is
often the task itself. The report says that it happened and where.

## What the report covers

Argent computes the report from the committed difference between the
workspace's base commit and the exact candidate commit. It reads Git objects
with Argent's own Git commands. It runs no repository code, starts no package
manager and uses no network.

1. **Tests.** Test files that the commit deleted, renamed, added or modified,
   and tests the commit newly marks as skipped. Test files are recognised by a
   documented list of path patterns; skip markers by a documented list per
   test runner.
2. **What the approved commands run.** Changes to:
   - `argent.json` (the candidate review already shows this status);
   - the script definitions the approved commands call, for example the
     `scripts` of `package.json`;
   - recognised configuration files of test runners and other checks, from a
     documented list of file names;
   - continuous-integration workflow definitions, which judge the change
     after a pull request exists.
3. **Dependencies.** Code the approved `setup` and `test` commands install and
   run:
   - packages added, removed or changed in version, read from the lock file;
   - packages that newly declare an install script;
   - a package resolved from a URL, a Git reference or a local path instead of
     the registry the base commit used;
   - changes to package-source settings committed in the repository, such as a
     registry override.

Every entry names the path, the kind of change and, for dependencies, the
package and both versions. All repository content is shown as literal text
with the same visible escapes as the candidate review.

## What the report says when it cannot tell

- For a group Argent has no recogniser for in this repository, the report says
  **not checkable**. It never says "no changes" for something it did not read.
- A file too large or malformed to summarise within the bounds is reported as
  changed and not summarised.
- The report lists the recognisers it applied, so "no changes" always means
  "none of these kinds".

## Where it appears

- **In the candidate review, before consent.** The person sees the report
  before any command runs. This matters most for dependencies: `setup` is the
  first time code from a newly added package can run on the developer's
  computer.
- **Next to the result.** A workspace shows passed, failed or stale together
  with the number of judging changes for that commit, without opening the
  transcript.
- **In the evidence record.** When the draft pull request (L1.5) lands, its
  evidence record carries the report for the same commit.

The report is bound to the base commit and the candidate commit. When either
changes it is computed again; an earlier report is never carried over.

## What kind of rule this is

The roadmap names rules by what enforces them. The report is a **check**:
Argent computes it itself, after the agent has finished, from committed
content. Because the candidate review displays it and consent is bound to that
exact review, consent to run the commands is also a **gate** that the report
passes through: commands do not run for a commit whose report was not
displayed. It is not a prevention control. Nothing stops the agent from making
the change.

## Limits

- It is not a security scan. It does not say whether a dependency is safe or
  whether a test change is correct.
- It reads the committed difference only. Local execution is not a sandbox:
  the agent runs as the developer and can change things outside the worktree
  that the report cannot see, such as package-manager settings in the home
  directory or a local cache. The report does not protect Argent's own records
  from a process running as the developer.
- It recognises documented file names, path patterns and markers. A test
  weakened by changing what it asserts appears only as a modified test file.
- It does not compare how many tests ran on the base commit and on the
  candidate.
- A complete display does not prove that a person read it.

## First scope

The first implementation covers what this repository uses: `package.json`
scripts, `package-lock.json`, npm source settings committed in the repository,
JavaScript and TypeScript test files and the skip markers of their common test
runners. Other package managers and languages are reported as not checkable
until a recogniser is added, each as its own small change.

## Security review focus

The report parses untrusted repository content before a person has consented
to anything. The review covers at least:

- bounded reads of manifests, lock files and diffs, with fixed limits on size,
  entry count and time, and a defined result when a limit is reached;
- strict parsing with no evaluation of repository content, no shell, no package
  manager and no network access;
- paths taken from Git tree entries and validated, never resolved through the
  worktree; symbolic links and submodules reported, not followed;
- literal display with visible escapes, and bridge validation of every field,
  as in the candidate review;
- no new runtime dependency in the engine without maintainer approval.

The [security model](0013-local-mvp.md#security-model) of spec 0013 is
unchanged. No new process type, executable or prevention claim is introduced.

## Acceptance criteria

Recorded at the product level; the detailed contract follows before
implementation.

1. For an idle local workspace with an approved configuration, the candidate
   review shows the report for the exact base and candidate commits, in the
   three groups above, before consent is possible.
2. Consent is bound to a review that includes the report. A report that could
   not be computed blocks consent with a stated reason.
3. The check result for a commit is shown with its judging-change count, and
   both become stale together when the commit or the base changes.
4. A group with no recogniser is shown as not checkable. A file over the
   bounds is shown as changed and not summarised.
5. Automated tests use real temporary Git repositories and cover: deleted,
   renamed, added and modified test files; newly skipped tests; changed
   scripts; changed check configuration and workflow files; added, removed and
   changed packages; a new install script; a package from a URL, Git reference
   or local path; a changed registry setting; oversized and malformed
   manifests and lock files; symbolic links; and hostile text in every
   displayed field.
6. Native smoke covers the report in the candidate review and next to a
   result, with a local fixture and no model account.

## Candidate test paths (in development)

Acceptance for the first increment, based on `37f5dc8` (20 November 2026):

- Inspect both already verified Git trees. Recognise JS/TS files with a
  `.test` or `.spec` suffix before the extension, or under a directory named
  `test`, `tests` or `__tests__`. Extensions are `js`, `jsx`, `ts`, `tsx`,
  `mjs`, `cjs`, `mts` and `cts`. Match case exactly. This identifies paths,
  including test helpers in these directories. It does not establish execution.
- Report each matching change once, including exact renames into or out of a
  recognised path. Use the existing change kind and both paths for a rename.
  Identify symlinks by Git mode without following them. Distinguish unchanged
  recognised paths from a repository with no recognised test paths in either
  tree. Name the recogniser and state the limits of all three groups.
- Before enabling consent, show the report followed by the full existing
  review. Bind the report format and contents into the review identity. Old
  receipts stay readable as history and cannot match a new review. Preserve
  the separate check and run consents.
- Use only bounded in-memory classification of pinned tree names and the
  existing change list. The bridge checks the bounded report references
  against the validated files. Use the same literal text and visible escapes
  for filenames as the full review. The existing full-review size, timeout and
  binary-content consent rules still apply.

Pre-implementation security review against `37f5dc8`, 20 November 2026:
the recogniser can reuse the verified trees with no additional object reads.
Validate the ordered references against both rename paths at the bridge, bind
the report version into the digest, and preserve historical receipt decoding.
The full review already refuses submodules; retain that refusal before consent.

Development evidence at `00ef222`, 20 November 2026: real temporary Git
tests cover added, removed, modified and exactly renamed paths, symlinks and
unrecognised repositories. Bridge and renderer fixtures cover invalid indices
and visible escapes. The repository check and dedicated diff review passed.

## Command configuration and workflow paths (in development)

Acceptance against `00ef222`, 20 November 2026:

- List changes to the root `argent.json` and to workflow YAML files directly
  under the root `.github/workflows/`. At any depth, recognise `tsconfig.json`,
  `.prettierignore`, and `jest.config`, `vitest.config` or `playwright.config`
  with the extension `js`, `ts`, `cjs`, `mjs`, `cts` or `mts`.
- Match either path of a rename, classify each changed file once within the
  group and show its existing review metadata. The pinned base includes an
  approved root configuration, so this recogniser always applies. An empty
  list means no matching file changed.
- The pre-implementation security review requires scanning only validated
  names in the existing change list. Validate ordered references at the
  bridge, display paths literally, and include this group in the consent
  identity. A matching path does not establish that the command uses it.

Development evidence at `97d45b4`, 20 November 2026: the real-Git, bridge
and renderer tests for configuration and workflow paths passed in the full
repository check. The dedicated diff review covered both sides of renames
and the use of pinned file metadata.

## Result count (in development)

Acceptance against `97d45b4`, 20 November 2026:

- Count the entries shown across the groups at review time. A file can have
  entries in more than one group. Zero means no entries from the applied
  recognisers. A group without coverage contributes no entries.
- Bind the count to the setup/test consent. Copy it from that receipt when
  persisting the result and its event in the same transaction. Reject a
  result whose count disagrees with the receipt. The check commands cannot
  provide the count.
- Display the count alongside passed and failed checks, with the existing
  freshness reading applying to both. A later base or commit preserves the
  original count and marks the pair stale. Preserve historical results with
  no count as “count not recorded”. Separate run actions carry no test count.
- The native smoke uses an added test path, exercises the before-consent
  report, and checks the same count at a passed result and after a new commit.

Development evidence at `e7a4398`, 20 November 2026: the full repository
check passed. Native fixture smoke displayed an added test path before consent,
then its count with the passed and stale check. The real-Git regression also
changed the base while retaining the candidate commit and the recorded count.

## npm script definitions (in development)

Acceptance against `e7a4398`, 20 November 2026:

- For each changed `package.json` at any depth, compare the own string entries
  in its `scripts` object. Report a script's name and whether it was added,
  removed, modified or moved with a renamed manifest. Show both paths for a
  rename. Include script definitions without claiming a command reaches them.
- Parse verified regular blobs as UTF-8 JSON. Each side is limited to 64 KiB,
  128 script definitions and 256 UTF-8 bytes per name. Never evaluate a script.
  A missing side or absent scripts member has no definitions. Invalid JSON,
  invalid shapes, symlinks and limits produce one changed, unsummarised file.
  The group allows 256 detailed entries in total; a file that would overflow
  gets one unsummarised entry instead. Preserve the full-review refusal above
  its own bounds. A complete report over 2,000 entries also blocks consent.
  A repository with no manifest in either tree is not checkable.
- The bridge validates the file references, ordered unique script names, change
  kinds and limits. Render names with visible escapes before consent, alongside
  the complete diff. Count each reported script or unsummarised file once.

Development evidence at `3a0688b`, 20 November 2026: real-Git tests covered
manifest edits, moves, missing sides, malformed JSON, symlinks and bounds.
Dedicated review tightened the bridge's per-side limits and rename validation.
The focused regressions and full repository check passed.

## Newly introduced test skip markers (in development)

Acceptance against `3a0688b`, 20 November 2026:

- In recognised test files, look for these literal calls at the start of a
  line after optional spaces or tabs: `test.skip`, `it.skip`, `describe.skip`
  (Node, Jest, Vitest and Mocha conventions), `test.describe.skip` (Playwright),
  and `xit`, `xtest`, `xdescribe` (disabled test or suite aliases). Match a
  single- or double-quoted title on the same line. An encountered call in this
  set with an unreadable title makes the file unsummarised.
- Compare occurrences by marker and literal title within each file. Moving a
  declaration down the file or renaming the file within the recognised paths
  adds no marker. Removing a different skipped title cannot mask a new one.
  Show each new marker and its candidate line number. These are textual
  markers: the same spelling in a multiline example can match. Other
  spellings, aliases, conditional options and skipped runtime results are
  outside this recogniser.
- Read only the existing pinned blob bytes. Apply the content limits above,
  including at most 128 markers per side and 256 new markers per group.
  Invalid text, a symlink or a bound yields a visible unsummarised marker
  check. Count each new marker or unsummarised check alongside the file entry.

Development evidence at `a78d386`, 20 November 2026: real Git fixtures
covered duplicate titles, exchanging skipped tests, unchanged renames, invalid
text and dynamic titles. Bridge and renderer regressions and the full check
passed. The dedicated review covered marker bounds and the shared findings
reader.

## npm lockfile package versions (in development)

Acceptance against `a78d386`, 20 November 2026:

- Compare the `packages` map of changed npm v2/v3 `package-lock.json` files,
  including nested projects. Match installed packages by the complete lockfile
  location ending in `node_modules/name` or `node_modules/@scope/name`. This
  distinguishes multiple installations. Read a local link's version from its
  recorded target entry when available. The root package and workspace source
  records are not additional installed packages.
- List added, removed, version-changed and moved installations. Show their
  lockfile path, installation name/location and both recorded versions, with
  an absent side labelled. Never read a local link from disk. Apply the
  existing 64 KiB side and 256-entry group bounds, with at most 1,024 package
  records per side and 256 UTF-8 bytes per displayed field.
- Invalid or unsupported formats, unusable version metadata, symbolic links,
  malformed installations and overflow produce one changed, unsummarised
  lockfile. An absent lockfile in both trees means not checkable. A lockfile
  with only unrelated metadata changes has zero recognised version changes.

Development evidence at `2c5945b`, 20 November 2026: the full check passed.
The dedicated review found that an inline version or malformed link flag could
hide target changes. Real-Git tests cover missing and conflicting target
metadata, invalid flags on either record, and scoped and nested installations.

## Newly declared install scripts (in development)

Acceptance against `2c5945b`, 20 November 2026:

- Treat a lock record's boolean `hasInstallScript` as npm's declaration of an
  install lifecycle script. Flag a new package with the declaration or an
  existing installation whose flag becomes true, even at the same version.
  The flag gives no information about script contents or execution.
- Read the recorded target's flag for local links. Reject conflicting inline
  flags and malformed field types with an unsummarised file. An unchanged
  true flag or a removed declaration alone does not add a finding. Show one
  entry per installation, including its versions, with the new declaration
  alongside any reported version change. The count includes that entry once.

Development evidence at `9b6a1d4`, 20 November 2026: real-Git fixtures
covered same-version declarations, new packages, unchanged flags and linked
target metadata. Independent review and the complete repository check passed.

## Resolved package sources (in development)

Acceptance against `9b6a1d4`, 20 November 2026:

- Compare each installed package's literal `resolved` value, independently of
  its version. Flag a changed reference even within the same category, and
  name the source for a new installation that records one. An installation
  with both a version and a resolution change still counts once.
- Display only source categories: the npm registry URL, another HTTP(S) URL
  (which may be a custom registry), a Git reference, a local path, another
  reference, or no recorded reference. Classify explicit Git protocols and
  hosted-Git shorthand, and linked installs, file references and explicit
  relative or absolute paths. A usual tarball URL change during a version
  update is still a changed lockfile resolution.
- Compare references as bounded strings without exposing them as report
  fields, expanding them, reading paths or contacting a host. An invalid
  field type, a control character, a malformed HTTP(S) URL or a reference
  over 4 KiB makes the changed file unsummarised. No package safety or
  registry-trust judgment follows from a source category.

Development evidence at `7ed3c5f`, 20 November 2026: real-Git tests covered
registry-to-URL, Git and local path changes, and changes between two URLs at
the same version. The dedicated review extended invalid-reference coverage
to C1 controls. The full repository check passed.

## Native report across all three groups (in development)

Acceptance against `7ed3c5f`, 20 November 2026: in a local fixture with no
model account, display an added test path, a new skip marker, an npm script
definition and an added package before consent. The package's source and
install declaration share the package entry. Check the report section itself
so the full diff cannot satisfy these assertions. After consent, show exactly
four entries beside the passed check. Restoring the base contents in a new
commit must leave that same count beside the stale result. The existing
approved fixture commands run without installing the example package.

Development evidence at `fe3acf2`, 20 November 2026: the native fixture
displayed all four entries and retained the count beside passed and stale
results. The repository check passed. No model account was used.

## Exact rename validation at the desktop bridge (in development)

Acceptance against `fe3acf2`, 20 November 2026: a moved finding relies on
an exact rename in the full review. The bridge must require matching blob
identities, sizes and modes, a distinct destination and one occurrence of
each source. A source cannot also be a changed destination. Reject inconsistent
responses before showing the report for consent. A real exact rename into a
recognised path must still appear.

Development evidence at `7de3b2f`, 20 November 2026: the real-Git bridge
test accepted a rename into a recognised check configuration and rejected
conflicting paths, blob identities, modes and sizes. The dedicated review
and full repository check passed.

## Deadline during report construction (in development)

Acceptance against `7de3b2f`, 20 November 2026: the candidate review's
existing time limit covers synchronous report classification and hashing.
Check elapsed monotonic time after computing the review identity. Reaching
the deadline blocks a new consent with the existing timeout reason and
creates no receipt or event. Exercise the boundary during manifest parsing
in a real Git fixture and allow a complete review just inside the limit.

Development evidence at `4003002`, 20 November 2026: advancing a monotonic
clock during a real Git manifest comparison reached the existing timeout
without writing consent or an event. The just-inside-limit review, existing
cancellation tests, full repository check and native fixture passed.

## Windows package-source paths (in development)

Acceptance against `4003002`, 20 November 2026: recognise explicit Windows
current-directory, parent-directory, rooted, drive and UNC paths in the
committed lockfile on every host. Display the local path category. Classify
only the recorded text, without resolving the path or opening a share.

Development evidence at `0840c39`, 20 November 2026: the real-Git fixture
covered all five Windows path forms and verified that reference text stayed
out of the report. Dedicated review and the full repository check passed.

## GitHub package-source shorthand (in development)

Acceptance against `0840c39`, 20 November 2026: classify a committed npm
`owner/repository` reference, with an optional `#ref`, as a Git reference.
Recognise ASCII owners starting with a letter or digit and containing
letters, digits or hyphens. Repository names may also contain dots and
underscores. The fragment may include a branch path or an npm semver range.
Scoped package names and longer unprefixed paths remain outside this
recogniser. Show only the category and compare the literal reference without
contacting a host.

Remaining acceptance includes committed npm source settings and the
maintainer trial. The complete review still refuses inputs beyond its own
bounds and unsupported submodules before consent.

## Exit evidence

Automated tests for the criteria above, the recorded security review, and the
maintainers' use on real tasks in this repository: for each task run through
Argent, whether the report was empty and what it listed. The maintainers then
record whether the report stays, changes or is removed, as for every
experiment.

## Out of scope

- A vulnerability or malware scanner, and any integration with one. A scanner
  a repository already uses can later be a named check under
  [project rules beyond tests](../../ROADMAP.md#milestones-and-exit-evidence).
- Blocking, reverting or rewriting a change.
- Network lookups of package metadata.
- Judging intent, or labelling a change as tampering.

## Open questions for the maintainers

- The order in which further package managers and languages get a recogniser.
- Whether a repository may declare its own test paths in `argent.json`, read at
  the base commit like the commands.
- Whether a later version also runs the tests on the base commit to compare
  how many ran.
