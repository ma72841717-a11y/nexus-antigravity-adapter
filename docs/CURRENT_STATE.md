# Current State

_Last updated: 2026-10-12 by Claude (NEX-10), on branch `claude/adapter-implementation-p0`._
_Sections below are dated individually; later sections can supersede earlier ones without the
earlier ones being deleted — see each section's own date before trusting a specific claim._

**Current test count: 108 tests passing** (`npm run typecheck`, `npm run build`, and `npm
test` all pass locally as of this commit). Update this line directly whenever the count
changes materially — do not replace it with a cross-reference to an ephemeral Paperclip issue
comment, since those are not a stable source of truth for readers of this file.

## NEX-10 (2026-10-12): workspace-binding resume gap — fixed, PR #1 still open against `main`

Codex Ma72's final independent review of PR #1 found that `workspaceIdentityMatches` in
`src/server/execute.ts` matched purely on `workspaceId` equality whenever either side declared
one, skipping the saved-cwd comparison entirely in that branch. This meant a workspace whose
`workspaceId` persists across a path change (e.g. a repo re-checked-out at a new remote path)
could resume a prior path's session on the same execution target — a session-state leak across
what should be a workspace boundary. Fixed so the saved cwd must match the resolved effective
execution cwd in all cases; a matching `workspaceId` is now an additional requirement layered
on top when either side declares one, never a substitute for the cwd check. Added a regression
test (`tests/integration/execute.test.ts`, "refuses to resume a session with a matching
workspaceId but a different stored cwd") covering exactly this case.

## NEX-8 (2026-10-12): PR #1 release blockers — fixed, PR #1 still open against `main`

Fixed four further findings from Codex Ma72's second independent review of PR #1 (npm tarball
shipping no code, stale/broken README and doc contradictions, an `--add-dir` path-resolution
bug against remote execution targets, test-only commits from `codex-rawea/adapter-tests-p0`
not yet merged). Full detail and the exact fix for each finding is in
`docs/UPSTREAM_PROVENANCE.md` ("PR #1 release-blocker fixes (NEX-8)"). `npm run typecheck`,
`npm run build`, and `npm test` all pass — see the Paperclip issue comment and commit history
on this branch for the exact current count. PR #1 (`claude/adapter-implementation-p0` → `main`)
still needs CI green plus a review from an identity other than the one that opened it before it
can merge.

## NEX-5 (2026-10-11): PR #1 review fixes — done, pushed, PR #1 still open against `main`

Merged PR #2 (test-only, `codex-rawea/adapter-tests-p0`) into this branch, then fixed its 2
known-failing regression tests plus the 4 findings from Codex Ma72's security review on PR #1
(dangerous-flag probe leak, session-id spoofing/provenance, resume-session workspace binding,
CLI-output diagnostics redaction). Full detail and the exact fix for each finding is in
`docs/UPSTREAM_PROVENANCE.md` ("PR #1 review fixes (NEX-5)"). `npm run typecheck`, `npm run
build`, and `npm test` all pass (98/98) — see the Paperclip issue comment and commit history on
this branch for the exact output. PR #1 (`claude/adapter-implementation-p0` → `main`) is
unchanged by this work item's boundaries: still needs CI green plus a review from an identity
other than the one that opened it before it can merge.

**`--add-dir` workspace path containment — deliberately deferred, not silently skipped:**
Ma72's review also flagged that `--add-dir` workspace paths are otherwise unvalidated. This fork
now resolves each workspace `cwd` through `path.resolve` before it reaches `--add-dir` (closing
simple `.`/`..` traversal), but does **not** enforce that every workspace path falls under a
single configured "workspace root." Rationale: there is no such single-root concept in this
codebase today — Paperclip legitimately registers multiple independent workspace directories
(one per repo/context) via `context.paperclipWorkspaces`, and the adapter's own `cwd` config
field is only the *default* process directory, not a declared boundary those workspaces must
nest under. Enforcing containment against the wrong boundary would silently break legitimate
multi-workspace runs. Revisit if/when Paperclip's platform-level adapter contract adds an
explicit "permitted workspace roots" concept to validate against.

## P0: upstream audit + import (2026-10-10 snapshot — historical, superseded by NEX-5/NEX-8 above)

_Kept for history. By NEX-5 (2026-10-11) GitHub was connected, this branch was pushed, and PR #1
was opened; by NEX-8 (2026-10-12) the test count and doc links below are also stale — see the
sections above for current reality. The code/architecture facts below (what was vendored, which
risks were fixed) still stand independent of the push/PR-status claims._

- **Code:** `src/` now contains a working, type-checked implementation forked from
  `@weslleycapelari/adapter-antigravity-local` at pinned commit
  `691725a674ec28b566868b39898ffa3ff0eae4f2`, with the four known risks from the original
  audit fixed at the code level (see `docs/UPSTREAM_PROVENANCE.md` for the full list):
  opt-in-only `--dangerously-skip-permissions`, sandbox-on-by-default, new-session-id
  capture, and a hard same-host execution refusal (`requireIsolatedExecutionTarget`).
- **Tests (stale count — see NEX-8 above for current):** at this snapshot, `npm run
  typecheck`, `npm run build`, and `npm test` all passed locally — 69 tests across
  `tests/unit/*.test.ts` (parse, utils, session codec, build-config, command args) and
  `tests/integration/execute.test.ts` (the full `execute()` pipeline against a fully mocked
  `@paperclipai/adapter-utils` runtime and a scripted fake `agy` CLI process; no real CLI,
  network call, or credential is touched).
- **Not pushed to GitHub (stale — fixed by NEX-5).** At this snapshot the company had zero
  registered GitHub connections and no host credential was available to this agent. GitHub
  access was subsequently connected and this branch pushed; PR #1 is open against `main`
  (see NEX-5/NEX-8 above).
- **Explicitly deferred, not silently skipped:**
  - `server/skills.ts` was vendored with a compile-compatibility fix (not byte-for-byte
    unchanged — see `docs/UPSTREAM_PROVENANCE.md`, corrected by NEX-8) but still not
    independently reviewed or exercised by dedicated tests in this pass — it manages
    `~/.agy/plugins` symlinks and has no obvious security-relevant default, but "no obvious
    risk" is not the same as "reviewed."
  - Transitive npm dependency install scripts were not audited (no direct lifecycle
    scripts are declared in `package.json` itself).
  - The Codex independent-review workstream has since started and produced the PR #1 review
    rounds referenced in NEX-5/NEX-8 above; the specific two-OpenAI-subscription Codex CLI
    auth question from this snapshot is out of scope for this doc and tracked in the
    Paperclip issue thread, not here.

## Bootstrap gates (charter B0–B5) — 2026-10-10 snapshot, historical

_Kept for history; B0 in particular is stale as of NEX-5 (2026-10-11) — GitHub is connected and
this branch has an open PR. The other gates (B2/B3/B5) were not re-verified as part of NEX-8 and
should not be read as current without re-checking live state._

- **B0 GitHub identity** — at this snapshot, NOT connected (0 GitHub connections, 0
  registered repositories). **Superseded:** connected by NEX-5; PR #1 is open.
- **B1 Protected `main`** — not configured at this snapshot; was blocked on B0.
- **B2 Worker identities** — not hired at this snapshot. The `nexus-testworker` SSH account
  and Paperclip SSH Environment (`04f19358-884c-4dbd-840a-4dcf582cd1fb`) existed and passed
  a connectivity probe, but no Claude/Codex worker agent had been hired against it yet.
  Not re-verified since.
- **B3 Isolation** — at this snapshot, SSH connectivity to an isolated account was proven
  (owner-run probe, `ok: true`), but actual Paperclip-managed *agent execution* under that
  isolation, as opposed to a manual SSH probe, was still unverified. Not re-verified since.
  This fork's own `requireIsolatedExecutionTarget` guard (see NEX-5/NEX-8 above) is an
  independent, code-level control that applies regardless of how that verification
  resolves.
- **B4 Alerts** — PASS (owner-confirmed Discord delivery).
- **B5 Hiring/strategy approval** — bundled with B2; was pending at this snapshot, not
  re-verified since.
- **Next action (as of this snapshot; see the Paperclip issue thread for current status):**
  the B3 agent-execution verification and worker hiring (B2/B5) continue as their own
  thread, independent of this adapter's own code-level fixes.
