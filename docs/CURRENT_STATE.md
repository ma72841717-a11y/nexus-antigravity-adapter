# Current State

_Last updated: 2026-10-11 by NEXUS, on branch `claude/adapter-implementation-p0`._

## P0: upstream audit + import — implementation done, not yet mergeable

- **Code:** `src/` now contains a working, type-checked implementation forked from
  `@weslleycapelari/adapter-antigravity-local` at pinned commit
  `691725a674ec28b566868b39898ffa3ff0eae4f2`, with the four known risks from the original
  audit fixed at the code level (see `docs/UPSTREAM_PROVENANCE.md` for the full list):
  opt-in-only `--dangerously-skip-permissions`, sandbox-on-by-default, new-session-id
  capture, and a hard same-host execution refusal (`requireIsolatedExecutionTarget`).
- **Tests:** `npm run typecheck`, `npm run build`, and `npm test` all pass locally — 69
  tests across `tests/unit/*.test.ts` (parse, utils, session codec, build-config, command
  args) and `tests/integration/execute.test.ts` (the full `execute()` pipeline against a
  fully mocked `@paperclipai/adapter-utils` runtime and a scripted fake `agy` CLI process;
  no real CLI, network call, or credential is touched).
- **Not pushed to GitHub.** This company has zero registered GitHub connections
  (`GET /api/companies/{companyId}/project-repositories` returns an empty list) and no
  host credential is available to this agent (`git push` fails cleanly with
  "could not read Username for 'https://github.com'" — confirmed, not assumed). The
  commit exists locally on `claude/adapter-implementation-p0`, HEAD at the time of writing
  is recorded in the Paperclip issue comment. **Owner action needed:** connect this
  company's GitHub access (NEX-1 has the standing connection card) so this branch can be
  pushed and a PR opened; nothing else is blocked on it.
- **Explicitly deferred, not silently skipped:**
  - `server/skills.ts` was vendored unchanged (attributed) but not independently reviewed
    or exercised by tests in this pass — it manages `~/.agy/plugins` symlinks and has no
    obvious security-relevant default, but "no obvious risk" is not the same as "reviewed."
  - Transitive npm dependency install scripts were not audited (no direct lifecycle
    scripts are declared in `package.json` itself).
  - The Codex independent-review workstream (`codex/adapter-security-tests-p0`) has not
    started from this side; it depends on a Codex-capable worker identity, which is still
    blocked on bootstrap gates B2/B5 (worker hiring) and the still-unresolved two-OpenAI-
    subscription Codex CLI auth question from earlier in this issue's thread.

## Bootstrap gates (charter B0–B5) — current status, reconciled against live API state, not assumed

- **B0 GitHub identity** — NOT connected. Verified directly this session: company has 0
  GitHub connections, 0 registered repositories. (An earlier bootstrap pass recorded this
  as "connected"; that was stale — re-verified now and corrected.)
- **B1 Protected `main`** — not configured; blocked on B0.
- **B2 Worker identities** — not hired. The `nexus-testworker` SSH account and Paperclip
  SSH Environment (`04f19358-884c-4dbd-840a-4dcf582cd1fb`) exist and passed a connectivity
  probe, but no Claude/Codex worker agent has been hired against it yet.
- **B3 Isolation** — SSH connectivity to an isolated account is proven (owner-run probe,
  `ok: true`). Actual Paperclip-managed *agent execution* under that isolation, as opposed
  to a manual SSH probe, is still unverified — this is the open item from earlier in this
  issue's thread, not resolved by this P0 code delivery. This fork's own
  `requireIsolatedExecutionTarget` guard (above) is an independent, code-level control that
  applies regardless of how that verification resolves.
- **B4 Alerts** — PASS (owner-confirmed Discord delivery).
- **B5 Hiring/strategy approval** — bundled with B2; still pending.
- **Next action:** owner connects GitHub (B0) so this branch can be pushed and reviewed;
  independently, the B3 agent-execution verification and worker hiring (B2/B5) continue as
  their own thread.
