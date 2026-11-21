# Direct approval of suggested commands

Status: design accepted 20 November 2026. Implementation is planned alongside
the [work queue](../../ROADMAP.md#alongside-the-queue). The current desktop
requires a committed root `argent.json` to approve commands.

## Desktop flow

When the workspace base has no `argent.json`, a developer can open **Commands**
and review a suggestion. For a recognised npm project the dialog would show:

| Source                   | Setup    | Test       |
| ------------------------ | -------- | ---------- |
| Suggested by Argent, npm | `npm ci` | `npm test` |

Show the base commit, the files used to recognise the project and every
argument with the same visible escapes as the file-backed review. **Approve
these commands** records the displayed suggestion directly, without creating
or committing a file. The developer can then review the exact candidate,
record consent and choose **Run checks**. The candidate review still explains
that the scripts and dependencies used by these commands can change.

## Acceptance criteria

1. **Choose the source at the workspace base.** Inspect the committed root
   entry for `argent.json` first. If present, use the existing reader and its
   errors. Only confirmed absence permits a suggestion. A malformed file, a
   symlink, a read error or a timeout must never trigger fallback.
2. **Start with one npm rule.** Require a regular root `package-lock.json` and
   a regular root `package.json` with an own, nonempty string at
   `scripts.test`. Use the lockfile as a project marker. Read the manifest
   from its pinned Git blob under the configuration reader's size and time
   limits. Suggest exactly the argument arrays `["npm", "ci"]` and
   `["npm", "test"]`. Copy no script text into the commands. An unsupported
   project gets no suggestion. An unreadable required input leaves approval
   unavailable and explains why.
3. **Record what the person approved.** Give suggestions their own source kind
   and versioned identity. Bind it to the canonical repository identity,
   suggestion rule and version, action names and exact ordered argument arrays.
   Store that snapshot, the approving operator and the base commit and input
   paths used for the review. A suggestion never borrows approval from a file
   with identical commands, or vice versa. Existing file-backed approvals and
   receipts retain their interpretation.
4. **Recheck before accepting or reusing approval.** The client supplies the
   identity it displayed. The service derives the current source and commands
   again from the workspace base. A changed source, rule version or command
   requires fresh approval. The same operator can reuse an identical suggestion
   in the same repository after a fresh match. Adding `argent.json` in a
   candidate appears in the review diff. It becomes the command source when
   it is present at the workspace base. A repeated approval request returns
   its original receipt under the existing idempotency rules.
5. **Keep execution separate.** Approval records an event and receipt
   atomically and starts no process. Before execution, candidate consent
   must bind the matched suggestion to the exact reviewed base and candidate,
   including the judging-changes report. Starting checks remains an explicit
   action. Historical approvals, consent for another commit and a reconnect
   cannot start checks.

## Verification required before implementation is called complete

- Use real Git fixtures for a recognised npm base, unsupported projects,
  malformed and unreadable inputs, symlinks, a candidate that adds or removes
  the configuration, and a later base with its own file. Check that changing
  the worktree or index cannot change the suggestion for a pinned base.
- Exercise changed arguments, rule-version changes, source switches with
  identical arguments, separate repositories and operators, idempotent retries
  and historical file-backed approvals. A stale or forged identity must leave
  no new approval or job.
- In native desktop smoke, approve a suggestion, reopen the dialog, review
  the candidate, consent and run checks in an offline npm fixture. Verify
  the stored result and freshness after an edit. Assert that approval alone
  created no job and wrote no configuration file.
- Review the actual Git reads, bounds, approval identity, persistence and
  desktop bridge against the [local security model](0013-local-mvp.md#security-model).
  Recognition must use trusted Git and bounded data parsing. It must never
  invoke npm, evaluate scripts, follow links or access the network. The
  configured commands can execute project code only after consent.
