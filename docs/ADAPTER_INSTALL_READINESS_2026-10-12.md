# Antigravity Adapter — Installation Readiness Assessment (2026-10-12)

Mode: read-only verification + reporting. **No install, removal, config, service-restart, or
B3 migration command was executed while producing this report.** All API calls below were
unauthenticated-vs-board-gated reads against the live instance; all package checks ran in an
isolated git worktree (`v0.1.0-rc1`, detached, removed after use) and a disposable `npm install`
scratch directory, never the live Paperclip process or its adapter registry.

## 1. Executive readiness verdict

**CONDITIONAL.** The adapter *source* is release-candidate quality: merged, tagged,
independently reviewed, 108/108 tests, clean build — re-verified fresh today, not just
relayed. Installing it into the live Paperclip instance is **not** ready, for one reason that
has nothing to do with the adapter code: **B3 (same-host loopback/implicit-admin isolation) is
still open**, and the live instance is still running in `local_trusted` mode. The project's own
Phase D (owner-approved registration) and Phase E (real AGY smoke test) are both explicitly
gated on B3 and stay blocked until it clears.

Two artifacts that feed this decision are themselves unresolved, not failed:
- PR #4 (B3 migration runbook) — independently reviewed and dispositioned **FIXED** on every
  finding by Codex Ma72, but **not merged**, and the runbook has **not been executed** against
  the live instance.
- PR #3 (B3 isolation acceptance tests) — **in_review**, with one pending owner
  `request_confirmation` (asking permission for one more read-only baseline GET) that is still
  unanswered. Do not resolve that card as a side effect of this report — it belongs to NEX-14.

## 2. Current GitHub and release state

| Item | State | Freshness |
| --- | --- | --- |
| `main` HEAD | `84b31c3619d18d9f1a0576e893d1988f42c77899` | Freshly verified via `get-commit` just now |
| Tag `v0.1.0-rc1` | points at `84b31c36`, identical to `main` HEAD | Freshly verified via `list-tags` |
| PR #1 (P0 implementation) | **merged** into `main` at `84b31c36` | Freshly verified |
| PR #2 (independent tests) | **closed** (fast-forwarded into PR #1's branch pre-merge, not merged as its own PR) | Freshly verified |
| PR #3 (B3 isolation acceptance tests) | **open**, head `2b49786`, base `main` | Freshly verified; CI `build-and-test` = success |
| PR #4 (B3 migration runbook) | **open**, head `265ed3b` (NEX-17's fix), base `main` | Freshly verified; CI `build-and-test` = success |
| PR #5 (status handover doc) | **open**, not merged | Freshly verified |
| This report | PR to be opened from `docs/adapter-install-readiness-2026-10-12` → `main` | New this turn |

No drift since the last handover (PR #5): `main` has not moved past `84b31c36` since the merge.

## 3. NEX-13/15/16/17 independent security-review matrix (B3 runbook, PR #4)

Reviewer throughout: **Codex Ma72** (independent security reviewer agent). All reviews are
source-grounded against the installed `paperclipai@2026.1005.0` CLI/server and read-only host
inspection (nginx vhost, systemd units, `journalctl` ACLs) — no live bootstrap, config write,
mode flip, or service restart was ever run as part of any review.

| # | Finding | First seen | Correction commit | Disposition | Evidence |
| - | --- | --- | --- | --- | --- |
| 1 | Runbook commands run as `ubuntu`, which cannot read/write `config.json` (mode `0600`) or control the `paperclip`-owned systemd user service | `9e8f31a` | `7db18da` | **FIXED** | Re-verified against real file perms / `systemctl --user` ownership |
| 2 | Bootstrap invite URL defaults to `127.0.0.1`, unusable from the owner's remote WireGuard browser; `https://` directive doesn't match the plain-HTTP nginx vhost | `9e8f31a` | `5eeb517` (via `PAPERCLIP_PUBLIC_URL`) | **FIXED** | Confirmed `resolveBootstrapInviteBaseUrl()` reads that var; vhost confirmed HTTP-only, no `ssl` directive |
| 3 | Owner's real login origin (`10.66.66.1:13100`) is not in Paperclip's trusted-origin set — `allowedHostnames` alone cannot produce a `:13100` origin | `9e8f31a` (as "owner lockout"), refined at `7db18da` review | `5eeb517` (via `BETTER_AUTH_TRUSTED_ORIGINS` env var, not `config.json`) | **FIXED** | Reproduced `deriveAuthTrustedOrigins()` call with the proposed config; confirmed env-var path bypasses the `config.json` auto-overwrite from `configure --section server` |
| 4 | Bootstrap invite token can be exposed in service logs and via a naive `paperclipai env` preflight that prints the live `PAPERCLIP_AGENT_JWT_SECRET` in cleartext, with no suppress flag | `9e8f31a` (logs); `5eeb517` review (the `env` command) | `265ed3b` | **FIXED** | Replaced with two secret-safe `grep`s (systemd unit/drop-ins + two specific `.env` keys only); re-run live on this host this turn still shows only unrelated overrides present (`PAPERCLIP_SERVICE_MANAGED`, `PAPERCLIP_INSTANCE_ID`, `PAPERCLIP_HOME`, `PATH`) |
| 5 | Interrupted mode-flip only conditionally recoverable; rollback procedure used the same inaccessible `ubuntu` command path | `9e8f31a` | `7db18da` | **FIXED** | Config writes confirmed atomic+backed-up in source; rollback rewritten to the `paperclip`-account path with `config.json.backup` restore |
| 6 | Verification step told the owner to check `service status`, which doesn't report deployment mode | `9e8f31a` | `7db18da` | **FIXED** | Replaced with `doctor`, confirmed to actually surface mode |
| 7 | npm package installability (not a security finding, but tracked in the same review) | initial review | n/a (already correct) | **FIXED**, independently re-verified again this turn | See §4 |

**All 7 tracked items are dispositioned FIXED as of the final review on `265ed3b`.** That review
explicitly caveats: *"The owner must still execute the runbook and record its live verification
results before the migration itself can be called complete. The live instance remains unchanged
by this review."* I am not upgrading that caveat — the runbook being correct on paper and the
migration being safely executed are two different gates, and only the first has passed.

**PR #4 is not merged.** A reviewed-and-fixed documentation PR sitting open is not the same as an
approved migration; nothing here should be read as clearing B3.

## 4. Adapter package verification — freshly re-run this turn, not just historical

Ran in an isolated `git worktree` at tag `v0.1.0-rc1` (`84b31c3`, detached, removed after use —
the live checkout on `claude/b3-migration-runbook` was never touched):

- `npm ci` — clean, 52 packages, **0 vulnerabilities**.
- `npm run typecheck` — clean.
- `npm run build` — clean.
- `npm test` — **108/108 passing**, 10 test files, 4.03s.
- `npm pack` → real tarball `nexus-ai-factory-adapter-antigravity-local-0.1.0-p0.tgz` (30,465
  bytes) → installed into a disposable scratch project → `require()`'d for real:
  - `createServerAdapter` is a function; calling it returns `type: "antigravity_local"` and
    exactly 7 keys: `agentConfigurationDoc, execute, instructionsPathKey, models,
    supportsInstructionsBundle, testEnvironment, type`.
  - Tarball contains 29 files under `dist/` plus `LICENSE`, `README.md`,
    `THIRD_PARTY_NOTICES.md`, and `package/package.json` — the packaging defect from the first
    review round (no `files` allowlist) is confirmed still fixed.
- `package.json` on `main` (read fresh via GitHub, not cached): name
  `@nexus-ai-factory/adapter-antigravity-local`, version `0.1.0-p0`, license `MIT`, dependency
  pinned to `@paperclipai/adapter-utils@2026.1005.0` — matches the installed Paperclip server
  version exactly (confirmed via `/api/health` → `"version":"2026.1005.0"` this turn).
- MIT attribution: `THIRD_PARTY_NOTICES.md` present in both the repo and the packed tarball.
- No outstanding critical adapter-code defect is open against this commit — all 6 P0 findings
  and both PR #2 regressions were closed before merge (see PR #1 commit message and prior NEX-1
  reports); nothing has touched `src/` since.

**Historical, not re-run this turn:** the original multi-round Codex Ma72/Rawea test-and-review
cycle that produced the 6 fixes baked into `84b31c36` — those are already merged and covered
by the fresh 108/108 run above, so re-litigating them added no new information.

## 5. Current Paperclip installation preflight (read-only)

- **Installed version:** `2026.1005.0` (confirmed via `/api/health`, matches the adapter's pinned
  dependency).
- **Deployment mode, confirmed again this turn:** `local_trusted`, `deploymentExposure: private`,
  `bootstrapInviteActive: false`. Unchanged since the last report — B3 has not moved.
- **Adapter registration state:** cannot be read — `GET /api/adapters` returned `403 Board access
  required` for this agent's token (re-confirmed this turn; same wall documented since Rev 6).
  I have no way to confirm from my own vantage point whether any adapter is currently registered.
- **Required authorization for `POST /api/adapters/install`:** instance-admin/board-only, per the
  OpenAPI schema and the same 403 pattern as every other adapter-management route. This is
  **not executable by this agent's token under any grant we've found** (the `environments:manage`
  saga earlier in this project established that grants alone don't cross this wall).
- **Install package source:** the reviewed, tagged commit — `@nexus-ai-factory/adapter-antigravity-local@0.1.0-p0` from `v0.1.0-rc1` (`84b31c36`), installed as a **local path**, not
  from a public registry (this package has never been published to npm).
- **Side effects of installation:** loads executable code into the live Paperclip server
  process. Whether it requires a restart/reload is not verifiable from here — the one endpoint
  that would confirm this (`environments/capabilities`-style adapter metadata) is board-gated.
  Treat it as **assume restart-equivalent risk** until an operator confirms otherwise.
- **Backup/restore capability, confirmed live this turn:** `databaseBackup.enabled: true`,
  `status: ok`, most recent backup `paperclip-20261012-072118.sql.gz` (10.0 MB, 0h old),
  `maxAgeHours: 26`. **Gap:** the backup directory
  (`/home/paperclip/.paperclip/instances/default/data/backups`) is **on the same host**. This
  satisfies on-host rollback but not the task's "off-host backup" requirement — there is no
  evidence of an off-host copy, and I have no mechanism to create or verify one from this agent's
  access level. This is a real, disclosed gap, not an assumption I'm papering over.
- **Removal procedure:** reported in an earlier NEX-1 turn (relayed from reading the shipped CLI
  source, not re-verified by me this turn) as `DELETE /api/adapters/{type}` — same board-only
  gate as install. Marking this **historical/unverified this session**, not fresh.

### Exact installation command for owner review — **NOT APPROVED — DO NOT EXECUTE**

```
POST /api/adapters/install
{
  "packageName": "@nexus-ai-factory/adapter-antigravity-local",
  "isLocalPath": true,
  "packagePath": "<owner-provided path to an extracted v0.1.0-rc1 checkout or tarball>",
  "version": "0.1.0-p0"
}
```

### Exact rollback command for owner review — **NOT APPROVED — DO NOT EXECUTE**

```
DELETE /api/adapters/antigravity_local
```

Both require a board session or an instance-admin-scoped API key; neither is something this
agent can run, probe, or dry-run.

## 6. Isolated AGY smoke-test design (prerequisite-gated, not executed)

Design, covering the 8 requested items — unchanged in substance from the design already
proposed in the project's Phase-2 directive response, restated here for a single reference
point:

1. **Adapter registration** — owner-run install command above, after B3 clears.
2. **Dedicated AGY execution identity** — the existing `nexus-agy` Linux account and its
   already-authenticated `agy` CLI session (per the original charter) — not recreated, not
   re-authenticated, not inspected beyond what's already on record.
3. **Successful AGY authentication** — verified via the adapter's own `testEnvironment()`
   diagnostic (`antigravity_hello_probe_auth_required` on failure, per
   `docs/OWNER_INSTALL_GUIDE.md`), not a manual credential check.
4. **One simple development task** in a workspace scoped to this adapter mini-project only — no
   ERP, no other repository.
5. **Result capture** — confirm Paperclip's run record stores exit status, structured output,
   and logs correctly.
6. **Session continuation** — resume the same conversation, confirm the workspace/cwd-bound
   session-identity fix (P0 finding #3) holds under a real CLI, not just the mocked tests.
7. **Timeout/cancellation handling** — one deliberately slow or killed run, confirm cleanup.
8. **Cleanup and rollback** — confirm the adapter can be deregistered (§5's `DELETE` command)
   without leaving orphaned state.

**Mandatory security condition, unchanged and still unmet:** no untrusted AGY execution on the
current `local_trusted` host is authorized until a demonstrably effective API/filesystem
isolation boundary is proven — not merely SSH connectivity or UID separation. That proof is
exactly what NEX-14 (PR #3) is still establishing, and its one remaining baseline probe is
sitting on an unanswered owner confirmation card.

**Status: BLOCKED.** Smallest owner action to unblock, in order:
1. Answer the pending `request_confirmation` on NEX-14 (interaction
   `f1410fb4-afb0-420b-a9c8-567993e8f53a`) — allow or decline one additional read-only GET to
   `/api/admin/users?query=<non-matching>` from the `nexus-testworker` SSH session, to get a real
   (not inconclusive) admin-API isolation baseline under `local_trusted`.
2. Separately, decide whether to merge PR #4 and actually execute the reviewed runbook — that is
   the action that would flip the instance to `authenticated` mode and close B3's root cause.
3. Only after both land: adapter install, registration, and the smoke test above become
   orderable.

## 7. Blockers and unresolved assumptions

- **Blocker:** NEX-14's pending confirmation card (above) — unanswered, not something this
  report resolves or should resolve as a side effect.
- **Blocker:** PR #4 is reviewed-clean but unmerged and unexecuted — the live instance is still
  `local_trusted`.
- **Unverified assumption:** whether adapter installation triggers a Paperclip service
  restart/reload. No board-level endpoint is readable to confirm either way.
- **Unverified assumption:** whether any off-host backup exists beyond the on-host
  `data/backups` directory confirmed above.
- **Not re-litigated:** the shared-GitHub-identity limitation on independent review (all agents
  post through the same `ma72841717-a11y` account, so reviews are COMMENTED, never
  APPROVED/REQUEST_CHANGES) — already disclosed in the prior status handover (PR #5), unchanged,
  not re-proven here.

## 8. Exact owner approval required

**One decision, not a batch:** answer the NEX-14 confirmation card (allow/decline the one
additional read-only GET). Everything else in this report is informational — no other approval
is being requested by this report itself. Merging PR #3/#4 and running the runbook are separate,
larger decisions the owner should make deliberately, not as a rider on this readiness check.

## 9. Next three actions, in dependency order

1. Owner answers the NEX-14 confirmation card → NEX-14 either completes with a real isolation
   baseline or stays open with a disclosed gap.
2. Owner (or ARGUS) reviews PR #3 and PR #4 for merge — both are independently reviewed and CI-green,
   but merging is a judgment call this report does not make for you.
3. Owner schedules and executes the B3 migration runbook (`docs/B3_MIGRATION_RUNBOOK.md` on PR
   #4) during a window where a login/lockout mistake is recoverable, then re-runs the NEX-14
   acceptance script expecting `401`/empty-array results instead of the current inconclusive
   baseline — that result, not this report, is what actually clears B3.

---

**READY FOR ARGUS INSTALLATION READINESS REVIEW — NO LIVE INSTALLATION OR SECURITY CHANGES PERFORMED**
