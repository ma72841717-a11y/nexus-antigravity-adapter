# NEXUS Status Handover — 2026-10-12

Audience: ARGUS independent review. Scope: NEXUS-AGY-ADAPTER-001 pilot, current state only.
Every claim below is labeled **VERIFIED** (checked directly against the live GitHub API / Paperclip
API / Paperclip task data during this audit), **REPORTED** (stated by an agent in a prior turn, not
re-checked here), **BLOCKED**, **FAILED**, or **NOT TESTED**. This document is read-only: no code,
config, agent, or infrastructure state was changed to produce it.

## 1. Executive Summary

The adapter's P0 implementation is merged, tagged, and independently reviewed — **VERIFIED**. The
project is now stuck on a narrower, harder problem: making the `local_trusted` → `authenticated`
migration (B3) actually safe to run. Two independent reviews (NEX-13 on the runbook, NEX-14 on the
isolation test script) have each found that the first attempt's *mechanism* was wrong in ways that
would have either done nothing or created a lockout/credential-exposure risk — not hypothetically,
but via direct source citation against the installed build. The runbook author (Claude Lead) is
currently unable to apply the fix: its task (NEX-15) is `blocked` after repeated run failures
exhausted Paperclip's retry budget. One more concrete, low-risk owner decision (NEX-14's pending
confirmation card) is also sitting unanswered. Nothing has been installed, deployed, or run against
the live Paperclip instance; B3 remains the single gate between the current state and any live AGY
worker execution.

## 2. Verified Repository and Release State

Repository: `ma72841717-a11y/nexus-antigravity-adapter`.

| Item | Value | Status |
|---|---|---|
| `main` HEAD | `84b31c3619d18d9f1a0576e893d1988f42c77899` | VERIFIED |
| Tag `v0.1.0-rc1` | points at `84b31c36...` (tag message names reviewed source `b1ca0a8`) | VERIFIED |
| PR #1 (P0 implementation) | merged 2026-10-12T01:07:55Z, head `b1ca0a8` → `main` | VERIFIED |
| PR #2 (independent tests) | merged 2026-10-11T21:32:38Z into `claude/adapter-implementation-p0` (not `main` directly; folded into PR #1 before that merge) | VERIFIED |
| PR #3 (B3 isolation acceptance tests, NEX-14) | **open**, `codex-rawea/b3-isolation-tests` → `main` | VERIFIED |
| PR #4 (B3 migration runbook, NEX-12) | **open**, `claude/b3-migration-runbook` → `main` | VERIFIED |

Test/build evidence for the merged P0 code (108/108 tests, clean typecheck/build, green CI run
`38188728860`) was independently reproduced by NEXUS on a clean checkout of `b1ca0a8` in the prior
session turn — **REPORTED**, not re-run in this audit since `main`/the tag have not moved since.
npm package verification (`npm pack` → install tarball → `require()` → `createServerAdapter`
exports correctly, 29 `dist/` files, 7-key adapter shape) was independently reproduced a second
time, by Codex Ma72, from the annotated tag in NEX-13's review — **VERIFIED** (via NEX-13's own
comment transcript, read in this audit).

The adapter has **not** been installed, registered, or executed inside the live Paperclip
instance — **VERIFIED by absence**: no adapter-install API call, no Environment-bound AGY worker,
and no `agy` CLI invocation appear anywhere in the task/comment history reviewed for this audit.

## 3. Paperclip Runtime and Agent Configuration

- Paperclip version: `2026.1005.0`, deployment mode `local_trusted`, bound to `127.0.0.1:3100` —
  **REPORTED** in prior turns, re-confirmed as still the operative assumption in NEX-12's and
  NEX-13's source-grep findings this turn (no restart or mode change has occurred).
- `nexus-testworker` (UID 1003): SSH-reachable, isolated at the filesystem/UID layer — **VERIFIED**
  (NEX-14's regression run: 5 read denials + 2 write denials, this audit's review of its comment).
- Claude — Lead Implementation Engineer (`79df1c3a-318a-429f-88db-ba8c00f1352d`): agent record
  shows `status: running`, `lastHeartbeatAt: 2026-10-12T05:11:28Z`, no `lastErrorMessage` recorded
  at the agent level — **VERIFIED** (direct API read this turn). This is inconsistent on its face
  with NEX-15 showing two consecutive "ACP agent reported a terminal access failure" run outcomes
  at 05:10:28Z and 05:11:28Z; the failure is visible at the *run* level, not surfaced onto the
  agent's own status field. See §6.
- Codex Rawea (`cefeb047-1efb-4cd1-8f3f-644fdc0937be`) and Codex Ma72
  (`44d702b5-6e32-4358-9dcd-75c5689e931e`): both executed real, distinguishable work this cycle
  (PR #3, and the NEX-13 review respectively) — **VERIFIED**, no execution blocker observed for
  either.
- No workers are currently scheduled for automatic/unattended execution against a live Paperclip
  Environment — **VERIFIED by absence**: the only existing SSH Environment
  (`04f19358-884c-4dbd-840a-4dcf582cd1fb`) has no agent bound to it as `defaultEnvironmentId` in any
  task reviewed this turn, and no adapter-install call has been made.

## 4. Task-by-Task Status

| Task | Status | Assignee | Verified disposition |
|---|---|---|---|
| NEX-1 | `blocked` | NEXUS | Top-level pilot task; functionally blocked on the NEX-12→13→14→15 chain below plus one open human-only confirmation. `blockedByIssueIds` is `null` on the record (a platform field-population gap noted in earlier revisions) — the dependency is tracked in comments/plan, not the structured field. |
| NEX-12 (B3 migration runbook) | `done` | Claude Lead | PR #4 opened and self-reported done, but its own content has 5 OPEN findings against it from NEX-13's review (§5) — "done" reflects "a PR was produced," not "the runbook is correct." |
| NEX-13 (independent review of NEX-12 + npm re-check) | `blocked` | Codex Ma72 | Review complete and posted (5 OPEN findings, 1 FIXED finding on packaging). Blocked waiting for NEX-15 to land a revision to re-review — correctly blocked, not stalled. |
| NEX-14 (B3 isolation acceptance tests) | `in_review` | Codex Rawea | PR #3 opened; SSH/filesystem isolation sub-test passed; the one HTTP-level baseline probe attempted (`/api/agents/me`) returned 401 but is not a valid test of the implicit-admin vulnerability (that route requires an agent actor regardless of deployment mode). A better baseline exists but needs one more live read-only GET — gated on interaction `f1410fb4-afb0-420b-a9c8-567993e8f53a`, **still pending, unanswered** as of this audit. |
| NEX-15 (fix NEX-13's findings in the runbook) | `blocked` | Claude Lead | Two consecutive run failures ("ACP agent reported a terminal access failure"), Paperclip's bounded retry budget exhausted, auto-escalated to `blocked` at 2026-10-12T05:11:51Z for board-level intervention. No work has started on the actual fix content yet. |

## 5. B3 Security Findings

**Underlying vulnerability (unchanged, still BLOCKED):** Paperclip's `local_trusted` mode treats any
unauthenticated request to its own loopback API (`127.0.0.1:3100`) as an implicit instance-admin.
A same-host SSH worker (`nexus-testworker`) shares that loopback; Unix-UID separation is a
filesystem/process boundary, not a network boundary, so it does not by itself close this gap.

**NEX-12 (runbook) — corrections NEX-12 made to the Rev 17 plan, VERIFIED from the installed build:**
1. `PAPERCLIP_DEPLOYMENT_MODE` env var only applies during first-time `onboard`; this instance is
   already onboarded, so the env-var+restart approach in Rev 17 would silently do nothing. The real
   mechanism is `paperclipai configure --section server`.
2. `auth bootstrap-ceo` no-ops until `authenticated` mode is already persisted — Rev 17's step
   order (bootstrap-ceo, then flip mode) was backwards.
3. With `database.mode: embedded-postgres` (this instance), the bootstrap invite auto-generates on
   restart once `authenticated` is persisted; manual `bootstrap-ceo` becomes a fallback, not the
   trigger.
4. `BETTER_AUTH_SECRET`/`PAPERCLIP_AGENT_JWT_SECRET` presence was confirmed (value not read) to
   already exist in this instance's `.env`.
5. New trap: CLI path resolution depends on the invoking OS user's home directory; running as
   `ubuntu` needs explicit `--config`/`PAPERCLIP_HOME` on every command, and `service *` subcommands
   take no `--config` flag at all.

**NEX-13 (independent review of NEX-12's PR #4) — 5 OPEN findings, source-cited against the
installed build, all still unresolved:**
1. **Command identity makes the proposed migration/rollback non-executable.** The runbook has
   `ubuntu` run `configure`/`service` commands against `/home/paperclip/...`, but that whole path
   tree (`0750`/`0700`/`config.json` `0600 paperclip:paperclip`) is unreadable/unwritable by
   `ubuntu`. `PAPERCLIP_HOME` changes path resolution, not OS permissions. `service restart` is a
   user-scoped `systemctl --user` call from the invoking account, not a cross-account control path.
   This invalidates both the migration steps and the rollback steps as written.
2. **Owner lockout / privilege-ownership gap.** The nginx check treats a forwarded `Authorization`
   header as proof of valid Paperclip-native auth — it is not. The bootstrap invite is generated
   *after* server start and is not pre-bound to the owner: whoever redeems it first gets
   `instance_admin`. No end-to-end owner-specific login/redemption test has been run through the
   real nginx/WireGuard URL.
3. **Bootstrap credential exposure.** The CLI prints the full bearer-like invite URL to stdout and
   to service logs on auto-generation. The runbook's recovery instructions (`service logs | grep`)
   leave that token sitting in persistent logs. `--force` (suggested as a routine recovery step)
   mints a fresh live invite even with an admin already present.
4. **Crash recovery is only conditionally safe.** Config writes are atomic with backup, so a crash
   mid-write is fine — but a crash *after* the authenticated config commits and *before* the owner
   redeems the invite leaves the instance in authenticated mode with no owner session and no
   working rollback path (rollback depends on the same broken `ubuntu` command identity from
   finding 1).
5. **Wrong verification command.** The runbook's claimed "mode=... visible in `service status`"
   citation points at a different code path; `service status` actually calls a health probe that
   returns only `ok`/`serverVersion`, not `deploymentMode`.

One item is resolved: **FIXED — npm package verification**, independently reproduced by Codex Ma72
from the `v0.1.0-rc1` tag (separately from NEXUS's own earlier reproduction) — pack, install,
`require()`, and adapter-shape all check out.

**NEX-14 (acceptance tests) — status:**
- SSH/filesystem isolation regression: **PASS** (5 read denials, 2 write denials, as
  `nexus-testworker` UID 1003).
- HTTP/API authorization-boundary baseline: **INCONCLUSIVE, not a real test yet.** The one
  permitted unauthenticated GET (`/api/agents/me`) returned 401 — but that's because the route
  requires an agent actor by design, in any deployment mode, so a 401 there proves nothing about
  the implicit-admin vulnerability either way. A correct baseline (an admin-only filtered endpoint
  that should return a 200 empty array under `local_trusted`'s implicit-admin fallback) has been
  identified but not run — it needs one additional live read-only GET, currently gated on
  unanswered interaction `f1410fb4-afb0-420b-a9c8-567993e8f53a`.
- No post-migration HTTP check has been run (none can be, since no migration has occurred).

**Net effect:** the authenticated-mode migration is **not demonstrably safe** to run yet. The
blocking facts are now specific and fixable (wrong command identity, credential-exposure pattern,
redemption-race lockout risk, wrong verification command) rather than the earlier, vaguer "one
nginx check" framing from Rev 17 — but none are fixed, because the fixing agent (NEX-15) cannot
currently run.

## 6. Claude OAuth Incident

Recurring failure mode on this Paperclip `2026.1005.0` instance: a Claude subscription OAuth access
token stored on disk expires while the CLI's own `auth status` still reports an active Pro login,
producing a surfaced run-level failure ("terminal access failure" / previously "OAuth access token
has expired") even though nothing about the account itself is wrong.

**Most recent owner-confirmed recovery (prior cycle, REPORTED):**
1. `claude auth status` reported an active Pro login.
2. The on-disk OAuth access token was confirmed expired.
3. A controlled `claude -p` request returned `AUTH_OK`, refreshing the token.
4. The owner retried the existing Paperclip subscription connection.
5. Paperclip reported a successful connection.

This is a **temporary recovery, not a permanent fix** — and this audit found direct evidence that
the pattern has recurred: NEX-15 (Claude Lead) failed twice in a row at 05:10:28Z and 05:11:28Z on
2026-10-12 with "ACP agent reported a terminal access failure," exhausting Paperclip's bounded retry
budget and escalating to `blocked` for board intervention. The agent's own status record shows
`running` with no `lastErrorMessage` — the failure signal lives at the run level, not the agent
level, which is why NEXUS could not self-diagnose or self-repair it from this agent's own
permissions.

Reference: upstream Paperclip issue #15108 and PR #14970 (cited by the owner; not independently
re-verified in this audit — **NOT TESTED**). No OAuth token, refresh token, or credential value was
read, displayed, or copied in the course of this audit.

## 7. Adapter Test and Review Evidence

(Summarizing §2; this section exists to satisfy the report structure, not duplicate it.)

- 108/108 tests passing, clean typecheck/build, CI green on `b1ca0a8` — REPORTED, previously
  independently reproduced by NEXUS; unchanged since `main` hasn't moved past the merge of that
  commit.
- 6/6 originally-identified implementation/security findings fixed in code with regression tests —
  REPORTED, previously independently diffed/verified by NEXUS.
- Independent Codex Ma72 review of the P0 implementation: 3 rounds, each finding real, distinct
  issues, final round confirmed clean — REPORTED from prior turns.
- Codex Ma72's review of the B3 runbook (NEX-13, this cycle): 5 OPEN + 1 FIXED, detailed in §5 —
  VERIFIED (read directly this turn).
- All GitHub reviews post as `COMMENTED`, never `APPROVED`/`REQUEST_CHANGES`, because every agent
  in this project shares one GitHub identity (`ma72841717-a11y`), which is also the PR author.
  Unchanged, structural, previously disclosed.

## 8. Current Blockers and Dependencies

Dependency chain, most specific first:

1. **NEX-15 blocked on Claude Lead agent health.** Until this agent can run again, the runbook fix
   cannot be written, so NEX-13 cannot re-review, so NEX-12/PR #4 cannot be finalized, so B3 cannot
   move forward at all via this path. This is the critical path.
2. **NEX-14 blocked on one unanswered confirmation** (`f1410fb4-afb0-420b-a9c8-567993e8f53a`) — an
   explicit, bounded, human-only-resolver ask for permission to run one more read-only GET. Low
   risk, independent of #1, answerable immediately.
3. **B3 overall blocked** on both of the above resolving, plus a net-new, more specific question
   NEX-13 raised: migration and rollback as currently drafted assume `ubuntu` can write
   Paperclip's config and control its service — it structurally cannot. Whoever actually owns
   `/home/paperclip` and its systemd/user service (likely the `paperclip` account itself, i.e. a
   genuine owner/root action, not a delegated `ubuntu` account) needs to be identified before any
   further runbook revision is useful. This is a new, narrower owner-fact-finding item, not a
   repeat of the earlier "nginx credential" question (which NEX-12 treated as still open and
   unchanged from Rev 17 §6).
4. **Stage D/E (live adapter registration, real AGY smoke test)** remain correctly un-started,
   gated on #3.

Nothing here requires re-litigating already-settled items: Option B (authenticated-mode migration)
over Option A (separate VPS) remains the owner's accepted direction; B4/Discord remains PASS;
GitHub/OpenAI connections remain configured and working for all four agents.

## 9. Risks and Unverified Assumptions

- **UNVERIFIED — real owner-operator identity for the migration.** NEX-13's finding that `ubuntu`
  cannot touch `config.json` or the service means the entire "owner uses a `ubuntu`-account CLI
  session" pattern from Rev 15 (previously proven safe for the SSH-probe bootstrap) does not
  transfer to this migration. No alternative has yet been confirmed.
- **UNVERIFIED — nginx-forwarded credential validity.** Still open from Rev 17 §6, now sharpened:
  even if a credential is forwarded, NEX-13 found no evidence it is bound to the owner specifically
  rather than "whoever redeems the invite first."
- **UNVERIFIED — whether the Claude OAuth recurrence is a one-off or will keep recurring** on every
  Claude Lead task, which would make this a structural scheduling/connection-health problem for the
  pilot, not a one-time hiccup.
- **ASSUMPTION, not yet re-tested — Claude Lead's own partially-completed NEX-15 work.** No partial
  runbook edits were found in this audit; the task failed before producing any diff, so nothing is
  at risk of being lost, but this has not been independently confirmed by reading NEX-15's branch
  (none exists yet).
- Package/test/review state from §2/§7 is solid (directly or very recently re-verified) and is not
  flagged as a risk.

## 10. Exact Next Owner/ARGUS Action

In priority order:

1. **Answer interaction `f1410fb4-afb0-420b-a9c8-567993e8f53a` on NEX-14** (accept or decline one
   additional read-only GET from `nexus-testworker` to `/api/admin/users?query=...`). Lowest risk,
   fully independent of everything else, unblocks NEX-14's real baseline evidence either way.
2. **Board-level recovery of the Claude Lead agent** (`79df1c3a-318a-429f-88db-ba8c00f1352d`) —
   same remediation pattern as the earlier OAuth incident (§6): confirm `claude auth status`,
   confirm/refresh the on-disk token, retry Paperclip's subscription connection for that agent.
   This is the critical-path unblock for NEX-15, and therefore for NEX-13, NEX-12, and B3 as a
   whole.
3. **Once NEX-15 can run, identify the real operator identity** for the config/service write (who
   or what account legitimately owns `/home/paperclip` and its service control) before asking it to
   revise the runbook again — otherwise the revision will hit the same "wrong account" class of
   finding NEX-13 just raised.
4. **Do not merge PR #3 or PR #4** until NEX-13 has re-reviewed and signed off the revised runbook,
   and NEX-14 has a real (not inconclusive) API-isolation baseline result.

No installation, registration, migration, or live AGY execution should proceed until the above
clears — consistent with every prior owner directive on this thread.

## 11. Evidence References

- PR #1 (merged): https://github.com/ma72841717-a11y/nexus-antigravity-adapter/pull/1 — commit `b1ca0a8812834e19603ad0899c75e286d9e43ef8` → `main` merge `84b31c3619d18d9f1a0576e893d1988f42c77899`
- PR #2 (merged into feature branch): https://github.com/ma72841717-a11y/nexus-antigravity-adapter/pull/2
- PR #3 (open, NEX-14): https://github.com/ma72841717-a11y/nexus-antigravity-adapter/pull/3
- PR #4 (open, NEX-12): https://github.com/ma72841717-a11y/nexus-antigravity-adapter/pull/4
- Tag: `v0.1.0-rc1` → `84b31c36...`
- Task IDs: NEX-1 (`21f751aa-2c57-4c2e-998a-c081a1c090c0`), NEX-12 (`a3cf2e26-fb30-4c58-bdcf-1e7f22a9e8e7`), NEX-13 (`678be346-0f58-4731-a134-37eb95325f0b`), NEX-14 (`a66386fc-cf87-4fee-b043-2dac26d60d85`), NEX-15 (`63080fe2-4f15-48c4-b7c8-987f0a6e7ded`)
- Pending interaction: `f1410fb4-afb0-420b-a9c8-567993e8f53a` on NEX-14 (request_confirmation, human_only resolver, unresolved)
- Claude Lead agent: `79df1c3a-318a-429f-88db-ba8c00f1352d`; Codex Rawea: `cefeb047-1efb-4cd1-8f3f-644fdc0937be`; Codex Ma72: `44d702b5-6e32-4358-9dcd-75c5689e931e`
- Prior plan document: `fe516260-526f-4c18-a9ac-2f72bd13ffd0`, revision 17 (Rev 17, B3 remediation comparison) — linked rather than duplicated here.

---

**READY FOR ARGUS INDEPENDENT REVIEW — NO LIVE CHANGES PERFORMED**
