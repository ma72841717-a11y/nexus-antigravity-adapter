# Antigravity Adapter — Installation Readiness Assessment (2026-10-12)

Mode: read-only verification + reporting. **No install, removal, config, service-restart, or
B3 migration command was executed while producing this report.** All API calls below were
unauthenticated-vs-board-gated reads against the live instance; all package/build checks ran in
an isolated `git clone` under this run's scratch directory (auto-removed after the run), never
against the live Paperclip adapter registry or its running process.

> **Revision note (this update):** ARGUS independently reviewed the prior version of this report
> and found two real defects — an incorrect `/api/adapters/install` request payload (mixed an npm
> package name with an unsupported `packagePath` field) and incomplete backup/rollback evidence.
> Both are corrected below against freshly re-verified, source-grounded evidence — the live
> `/api/openapi.json` request schema for the install contract (not relayed), and a real build of
> the local-install directory layout (not asserted). Sections 1–4 are otherwise unchanged from the
> prior revision; nothing in PR #3 or PR #4 was touched.

## 1. Executive readiness verdict

**CONDITIONAL.** The adapter *source* is release-candidate quality: merged, tagged,
independently reviewed, 108/108 tests, clean build — re-verified fresh today, not just
relayed. Installing it into the live Paperclip instance is **not** ready, for one reason that
has nothing to do with the adapter code: **B3 (same-host loopback/implicit-admin isolation) is
still open**, and the live instance is still running in `local_trusted` mode.

This revision introduces an explicit two-gate framing (§8–9) per the owner's latest directive:

- **Gate A — adapter registration only** does **not** strictly require B3 to clear first (it is a
  separate owner-authorized action), but it does require a corrected install payload (now fixed
  below), a prepared local-install directory (now built and verified below), and confirmed backup
  readiness (now detailed below).
- **Gate B — a real AGY execution smoke test** remains hard-blocked on B3, unconditionally, per
  the owner's own standing security condition. Registering the adapter type is not the same as
  running untrusted code through it.

Two artifacts that feed the B3 decision are themselves unresolved, not failed, and are **not**
modified by this revision:
- PR #4 (B3 migration runbook) — independently reviewed and dispositioned **FIXED** on every
  finding by Codex Ma72, but **not merged**, and the runbook has **not been executed** against
  the live instance.
- PR #3 (B3 isolation acceptance tests) — **in_review**, with one pending owner
  `request_confirmation` (asking permission for one more read-only baseline GET) that is still
  unanswered as of this revision. That card belongs to NEX-14; this report does not resolve it.

## 2. Current GitHub and release state

Freshly re-queried this turn — zero drift since the prior revision:

| Item | State |
| --- | --- |
| `main` HEAD | `84b31c3619d18d9f1a0576e893d1988f42c77899` |
| Tag `v0.1.0-rc1` | points at `84b31c36`, identical to `main` HEAD |
| PR #1 (P0 implementation) | **merged** into `main` at `84b31c36` |
| PR #2 (independent tests) | **closed** (fast-forwarded pre-merge, not merged as its own PR) |
| PR #3 (B3 isolation acceptance tests) | **open**, head `2b49786`, base `main` — unchanged |
| PR #4 (B3 migration runbook) | **open**, head `265ed3b`, base `main` — unchanged |
| PR #5 (status handover doc) | **open**, not merged — unchanged |
| PR #6 (this report) | this revision updates it; still not merged |

## 3. NEX-13/15/16/17 independent security-review matrix (B3 runbook, PR #4)

**Unchanged from the prior revision — not re-reviewed, re-litigated, or modified this turn**, per
this task's explicit instruction not to touch PR #3/#4 or run additional B3 probes. All 7 tracked
findings remain dispositioned **FIXED** by Codex Ma72 as of commit `265ed3b`, with the reviewer's
own caveat preserved: *"The owner must still execute the runbook and record its live verification
results before the migration itself can be called complete. The live instance remains unchanged
by this review."* PR #4 is reviewed-clean but **not merged**; nothing here clears B3.

## 4. Adapter package verification — freshly re-run this turn

Same clean result as the prior revision (not re-litigated in detail here): `npm ci` (0
vulnerabilities), `npm run typecheck`, `npm run build`, `npm test` (108/108), and a real `npm
pack` → install → `require()` round-trip, all run against tag `v0.1.0-rc1` (`84b31c36`) in an
isolated worktree. See §5 below for this revision's *additional* verification: building the exact
**local-path install directory** layout, not just a packed tarball.

## 5. Corrected installation API contract

**ARGUS's correction is confirmed — independently, against the live instance's own OpenAPI
schema, not taken on the review's word alone.** Re-fetched `GET /api/openapi.json` this turn and
read the `POST /api/adapters/install` operation directly:

```json
{
  "packageName": { "type": "string" },
  "isLocalPath": { "type": "boolean" },
  "version": { "type": "string" }
}
```
Required: `packageName` only. **No `packagePath` field exists in this schema.** Security schemes
listed: `BoardSessionAuth`, `BoardApiKeyAuth`, `AgentBearerAuth`.

**Why the prior revision had `packagePath`, traced to its actual source (not guessed):** the
shipped `paperclipai` CLI bundle (`dist/index.js`, same build the server runs) defines a
*different* schema, `installPluginSchema`, for the unrelated `/api/plugins/install` endpoint:

```js
installPluginSchema = z.object({
  packageName: z.string().min(1),
  version: z.string().min(1).optional(),
  /** Set by loader for local-path installs so the worker can be resolved. */
  packagePath: z.string().min(1).optional()
});
```
Note the comment: `packagePath` there is **set by the server's loader after resolution**, not
supplied by the caller — and it belongs to *plugins* (UI slots/launchers/skills), a distinct
subsystem from *adapters* (agent execution backends like `claude_local`, `codex_local`,
`antigravity_local`). The prior revision's payload conflated the two. Corrected, source-verified
payload for the **adapter** install contract:

```
POST /api/adapters/install
{
  "packageName": "<absolute path to the prepared local-install directory — see §6>",
  "isLocalPath": true,
  "version": "0.1.0-p0"
}
```

No `packagePath` field. **NOT APPROVED — DO NOT EXECUTE.**

Corrected rollback command, unchanged in form, re-confirmed against the live spec (`DELETE
/api/adapters/{type}`, same three auth schemes):
```
DELETE /api/adapters/antigravity_local
```
**NOT APPROVED — DO NOT EXECUTE.**

## 6. Precise local-install directory — built and verified this turn

The task asked for the *actual* absolute directory, not an assumed one. I built it for real, in
this run's isolated scratch space (never the live adapter path, never pointed at by any install
call), to prove the layout is genuinely loadable:

1. `git clone --branch v0.1.0-rc1 https://github.com/ma72841717-a11y/nexus-antigravity-adapter.git`
   → resolves to commit `84b31c3619d18d9f1a0576e893d1988f42c77899`, matching `main`/the tag exactly.
2. `npm ci` (full, incl. dev deps for the build) → 52 packages, 0 vulnerabilities.
3. `npm run build` (`tsc && cp package.json dist/`) → clean.
4. `npm prune --omit=dev` → 33 packages remain (11 top-level), production-only.
5. Resulting directory root contains: `package.json` (`main: "./dist/index.js"`, `exports` map
   for `.`/`./server`/`./ui`/`./cli`, `files: ["dist", "THIRD_PARTY_NOTICES.md"]`), `dist/`
   (`cli/`, `server/`, `index.js`, `index.d.ts`), `node_modules/` (95M, production deps only:
   `@paperclipai/adapter-utils@2026.1005.0`, `picocolors`, transitives), `LICENSE`,
   `THIRD_PARTY_NOTICES.md`, `README.md`.
6. Verified by loading it exactly as a local-path loader would, from the directory root itself
   (not a packed tarball this time): `node -e "require('./').createServerAdapter({})"` →
   returns `type: "antigravity_local"` with the expected 7 keys (`agentConfigurationDoc, execute,
   instructionsPathKey, models, supportsInstructionsBundle, testEnvironment, type`). This is the
   same success shape as the earlier `npm pack` test, now confirmed from a plain directory, which
   is the actual shape `isLocalPath: true` + a directory `packageName` implies.

**Accessibility under the `paperclip` service identity:** confirmed directly — this agent session
itself runs as `uid=995(paperclip) gid=989(paperclip)` (checked via `whoami`/`id` this turn), the
same account that owns and runs the live Paperclip server process (`paperclipai.service`, a
per-user systemd unit at `/home/paperclip/.config/systemd/user/paperclipai.service`). Any
directory built under a `paperclip`-owned path is automatically readable by the process that would
load it — this is a plain filesystem fact, not a board-gated permission, and needs no separate
grant.

**Does a durable copy of this directory already exist?** No. I deliberately built it only in this
run's auto-removed scratch space, per the task's explicit instruction not to execute
installation-related changes. The directory above does not persist past this run.

**Preparation procedure for the owner/operator to create the durable version** (documented, not
executed):
1. Pick an immutable, versioned, `paperclip`-owned path. **Proposed, not a platform
   convention** — I checked `config.json` (no `adapters`/`plugins` storage-path key exists) and
   `paperclipai adapter install --help` (plain `--payload-json` pass-through, no built-in
   directory convention) and found no server-enforced location to defer to. Suggested:
   `/home/paperclip/adapters/nexus-antigravity-adapter-v0.1.0-rc1/` (version-suffixed so a later
   release gets a new directory rather than an in-place overwrite).
2. Run steps 1–4 above against that path.
3. Confirm step 6's `require()` check against that exact path before ever referencing it in an
   install call.
4. Treat the directory as immutable once built — cut a new versioned directory per future release
   instead of rebuilding in place, so a bad build can never silently replace a working one.

## 7. Installation behavior — source/schema-verified vs. requires a live test

**Confirmed this turn, directly from the live OpenAPI schema (not inferred):**
- Request contract for `POST /api/adapters/install`: as in §5.
- Response schema for both `POST /api/adapters/install` (`201`) and `GET /api/adapters` (`200`) is
  an untyped free-form object (`additionalProperties: {}`) — **no `requiresRestart` field is
  declared anywhere in the spec.** If that signal exists at all, it is not exposed through the
  documented response shape.
- Auth re-tested empirically this turn: `GET /api/adapters` and `GET /api/adapters/antigravity_local`
  both return `403 Board access required` for this agent's token, despite `AgentBearerAuth` being
  listed as an accepted scheme in the spec — the same business-logic wall found on every other
  adapter/environment/secrets route throughout this project. I did **not** test `POST install` or
  `DELETE` empirically (even against a type I'd expect to 404), per this task's explicit
  restriction on live adapter-management mutating calls — there is no reason from the evidence
  above to expect the write routes behave differently from their sibling read routes on the same
  resource family, but that is an inference, not a test result.
- Three distinct POST actions exist on an adapter resource — `install`, `reload`, `reinstall` —
  which is evidence they are three different operations, not that `install` always performs a
  full reload. I cannot go further than that from the spec alone.

**Honestly marked NOT VERIFIABLE from any source I have access to — disclosed, not invented:**
1. Whether first-time registration requires a Paperclip process restart.
2. The exact trigger for `requiresRestart` becoming true (not even a documented response field).
3. Whether installing an already-registered type replaces it or errors (no `409` response code is
   declared for `POST /install`, which is weak circumstantial evidence against an explicit
   "already exists" rejection — not proof of upsert behavior).
4. Whether adapter loading executes initialization code server-side beyond calling
   `createServerAdapter(config)` — confirmed that call itself executes real code synchronously
   with the config object I control in my own sandboxed test (§6), but the live server's handling
   of that call (sandboxing, error containment, timing) is not observable from here.
5. Where Paperclip persists adapter-registration metadata (DB table vs. config file) — not present
   in the shipped CLI bundle (server-only) or the client-facing API.
6. Whether a registered adapter survives a server restart — follows from (5) being unknown.
7. Whether local-path installs need anything beyond the directory built in §6 (e.g. an undocumented
   Node engine pin) — cannot rule out without a live test.
8. Exact removal/rollback *behavior* (as opposed to the route's existence and auth gate, which are
   confirmed) — marked **NOT TESTED**, by this task's own explicit restriction, not by inability.

## 8. Backup and recovery readiness

**On-host PostgreSQL backup — confirmed live, this turn, with current numbers:** `enabled: true`,
`status: ok`, latest file `paperclip-20261012-082118.sql.gz` (9.6 MiB, 0.5h old at check time),
`maxAgeHours: 26`, directory `/home/paperclip/.paperclip/instances/default/data/backups`, no
`lastFailure`, no warnings. Source: `config.json` (`database.backup`: hourly interval, 30-day
retention) cross-checked against the live `/api/health` report — both agree.

**What backup covers what, read directly from `config.json` (readable by this agent session,
since it runs as the same `paperclip` account that owns the file):**
- **PostgreSQL (embedded)**: `embedded-postgres` mode, data dir
  `/home/paperclip/.paperclip/instances/default/db`, port `54329` — covered by the automated
  `pg_dump`-style backup above.
- **Agent records and adapter-registration metadata**: almost certainly stored in this same
  Postgres instance alongside every other Paperclip record this project has interacted with
  (issues, agents, interactions) — **inferred, not confirmed**, since adapter-registration storage
  location is one of the §7 "not verifiable" items. If true, the existing DB backup already covers
  it with no separate export step; this should be confirmed by the operator the first time they
  restore a backup, not assumed indefinitely.
- **Non-secret configuration**: `config.json` and `runtime-info.json` — both small, both plain
  JSON, safe to copy as plain files.
- **Authentication material — NOT to be copied into GitHub, printed, or handled by this report**:
  `secrets/master.key` (the `local_encrypted` secrets-provider key), the instance `.env` file, and
  anything under `ai-local-logins/`. These must move only over a channel the owner already
  controls (e.g. `scp`/`rsync` over the existing WireGuard interface), never through chat, GitHub,
  or any output this agent produces.
- **Off-host copy — confirmed gap, unchanged from the prior revision:** the backup directory above
  is on this same host. No off-host copy exists or has been verified. I have no mechanism to
  create or verify one from this agent's access level (that would mean handling the live secrets
  material, which I should not do without explicit, separate authorization), so I am not
  attempting it.

**Owner-operated backup/recovery plan (documented for owner action, not executed by me):**
1. Encrypt-and-copy the four items above (DB backup file, `config.json`, `runtime-info.json`,
   `secrets/` dir) to off-host storage the owner controls, over the existing WireGuard path —
   e.g. `age`- or `gpg`-encrypted tarball, transferred by the owner's own hand.
2. Periodically restore the latest DB backup into a disposable, throwaway Postgres instance and
   confirm it loads — this is the actual integrity check; a file merely existing on disk doesn't
   prove it restores cleanly. Not run by me; a real restore operation is out of this report's
   read-only scope.
3. Recovery if adapter installation fails or Paperclip becomes inaccessible: restart via
   `systemctl --user restart paperclipai` under the `paperclip` account (unit confirmed present at
   `/home/paperclip/.config/systemd/user/paperclipai.service`); if the database itself is
   corrupted, restore the most recent `data/backups/*.sql.gz` into the `embeddedPostgresDataDir`
   path from `config.json`, then restart the service.

**Exact minimum owner action to verify recovery readiness:** confirm, by their own hand, that they
can list `/home/paperclip/.paperclip/instances/default/data/backups/` and copy the newest file to
somewhere off this VPS that they control. That single successful copy closes the off-host-backup
gap. I am not performing that copy myself.

## 9. Gate A — Adapter registration (new, per owner directive)

**Goal:** install the reviewed adapter and confirm Paperclip recognizes `antigravity_local`, with
no AGY worker launch.

| Requirement | Status |
| --- | --- |
| Correct installation API request | **READY** — corrected and schema-verified in §5 |
| Verified package and dependencies | **READY** — real build verified in §6 |
| Owner-authorized installation | **PENDING** — no owner approval has been requested or given for an actual install call; this report proposes the command, it does not execute or request to execute it |
| Backup and rollback readiness | **CONDITIONAL** — on-host backup confirmed healthy; off-host copy still an owner action (§8) |
| Successful adapter inventory check | **NOT TESTABLE BY THIS AGENT** — `GET /api/adapters` is board-gated; only a board-session/API-key caller (the owner, or an owner-approved operator flow) can confirm registration after install |
| No AGY worker launch | **BY DESIGN** — Gate A explicitly excludes this; see Gate B |

**Gate A overall: CONDITIONAL — ready to execute once the owner decides to, with the off-host
backup gap as the one disclosed, unresolved item.** Per the owner's own directive, B3 is *not* a
hard prerequisite for registration-only testing — but I am not recommending the owner proceed
with install until they've seen this table, since inventory verification afterward is something
only they (or a board-session caller) can do, not me.

## 10. Gate B — Real AGY smoke test (unchanged in substance, restated against Gate A)

**Goal:** execute one real Antigravity task through Paperclip.

1. **Adapter registration** — depends on Gate A completing first.
2. **Dedicated AGY execution identity** — the existing `nexus-agy` Linux account and its
   already-authenticated `agy` CLI session (per the original charter); not recreated, not
   re-authenticated, not inspected beyond what's already on record.
3. **Verified AGY authentication** — via the adapter's own `testEnvironment()` diagnostic
   (`antigravity_hello_probe_auth_required` on failure).
4. **One simple development task** in a workspace scoped to this adapter mini-project only — no
   ERP, no other repository.
5. **Correct task result capture** — exit status, structured output, and logs stored correctly.
6. **Session continuation** — confirm the workspace/cwd-bound session-identity fix (P0 finding #3)
   holds under a real CLI, not just mocked tests.
7. **Timeout/cancellation handling** — one deliberately slow or killed run, confirm cleanup.
8. **Cleanup and rollback** — confirm the adapter can be deregistered (§5's `DELETE` command)
   without orphaned state.

**Mandatory security condition, unchanged and still unmet:** no untrusted AGY execution on the
current `local_trusted` host is authorized until a demonstrably effective API/filesystem isolation
boundary is proven — not merely SSH connectivity or UID separation. That proof is exactly what
NEX-14 (PR #3) is still establishing.

**Gate B overall: BLOCKED on B3, unconditionally — independent of Gate A's outcome.**

## 11. Blockers and unresolved assumptions

- **Blocker (Gate B only):** B3 — live instance still `local_trusted` (re-confirmed this turn);
  PR #4 reviewed-clean but unmerged and unexecuted.
- **Blocker (Gate B only):** NEX-14's pending confirmation card — unanswered; not resolved or
  touched by this report.
- **Owner decision pending (Gate A):** whether to authorize the install call in §5 now that its
  payload is corrected. Nothing technical blocks it; the decision itself is the gate.
- **Unverified assumption:** whether adapter installation triggers a Paperclip service
  restart/reload (§7).
- **Unverified assumption:** whether adapter-registration metadata lives in the same Postgres
  instance already covered by the automated backup (§8) — likely, not confirmed.
- **Unverified assumption:** whether any off-host backup exists beyond the on-host `data/backups`
  directory — confirmed it does not, as of this check.
- **Not re-litigated:** the shared-GitHub-identity limitation on independent review (all agents
  post through the same `ma72841717-a11y` account) — already disclosed in PR #5, unchanged.

## 12. Exact owner approval required

Two separate decisions, not bundled into one ask:
1. **Gate A:** whether to authorize running the corrected install command in §5 against a durable
   copy of the §6 directory. This report does not request that approval itself — it only makes the
   command executable and disclosed.
2. **Gate B:** unchanged — still gated on the pre-existing NEX-14 confirmation card and the B3
   migration decision; not newly requested here.

## 13. Next three actions, in dependency order

1. If the owner wants to proceed with Gate A: build the durable local-install directory per §6's
   procedure, then run the corrected install command from §5 via a board session or board API key
   (not this agent's token), then confirm registration via `GET /api/adapters` (also board-only).
2. Independently of (1): owner answers the NEX-14 confirmation card, and separately decides whether
   to merge PR #4 and execute the B3 runbook — the action that actually closes Gate B's hard
   blocker.
3. Only after both (1) and B3 clear: the Gate B smoke test in §10 becomes orderable.

---

**READY FOR ARGUS FINAL INSTALLATION PREFLIGHT REVIEW — NO LIVE ADAPTER OR INFRASTRUCTURE CHANGES PERFORMED**
