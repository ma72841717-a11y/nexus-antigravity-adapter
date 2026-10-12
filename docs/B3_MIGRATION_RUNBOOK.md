# B3 Migration Runbook: `local_trusted` → `authenticated` (and rollback)

**Status: documentation only. Nothing in this file has been executed.** This runbook was
written, and the CLI claims in it verified, without running `bootstrap-ceo`, without changing
`PAPERCLIP_DEPLOYMENT_MODE`/`server.deploymentMode`, without restarting the Paperclip service,
and without touching WireGuard, nginx, SSH, firewall, or sudoers. It only documents what the
owner would run, and corrects several command-level assumptions in NEX-1 Rev 17 against the
actual shipped CLI.

Audience: the owner (root/host access), executing by hand. Every command block below is meant
to be copy-pasted as-is; the surrounding prose explains what it does and why the ordering
matters.

**Verified against:** the exact installed build, `paperclipai-2026.1005.0.tgz`
(`dist/index.js`, 64,516 lines), extracted read-only to scratch and grepped — the same artifact
Rev 17 inspected. Line numbers below refer to that file. **Also verified read-only against the
live config on this host**, `/home/paperclip/.paperclip/instances/default/config.json`
(read, not modified):

```json
{
  "deploymentMode": "local_trusted",
  "exposure": "private",
  "bind": "loopback",
  "host": "127.0.0.1",
  "port": 3100
}
```
`database.mode` on this instance is `embedded-postgres`, and
`/home/paperclip/.paperclip/instances/default/.env` already contains a
`PAPERCLIP_AGENT_JWT_SECRET` entry (presence confirmed with `grep -l`; value not read). Both
facts matter below.

---

## 0. Corrections to Rev 17 / the parent-issue assumptions — read this before running anything

Rev 17 (NEX-1) and the parent task description for this runbook both describe the mechanism as
"set the `PAPERCLIP_DEPLOYMENT_MODE` env var, restart, done." Re-reading the shipped CLI source
shows that is **not how an already-onboarded instance works**. Five corrections:

1. **The env var only affects a brand-new `onboard` run; it is ignored on an already-onboarded
   instance.** `PAPERCLIP_DEPLOYMENT_MODE` is read in exactly one place,
   `quickstartDefaultsFromEnv()` (`dist/index.js:49067`), which is only invoked by the `onboard`
   command's non-interactive quickstart path (`opts.yes === true && !opts.bind`), or implicitly
   by `run` the first time it finds *no* `config.json` at all. Once `config.json` exists (it
   does — see above), `paperclipai run` and the systemd-managed service both load the server's
   mode via `readConfig(configPath)` (`dist/index.js:21130`), which parses the **persisted JSON
   file** directly. Nothing re-derives `deploymentMode` from the environment on restart.
   **Setting the env var and restarting, as Rev 17 §4 and §6 describe, would silently do
   nothing** — the instance would stay on `local_trusted`, and the owner would reasonably but
   wrongly believe the migration had happened.
2. **`paperclipai auth bootstrap-ceo` is a no-op until the persisted config already says
   `authenticated`.** Its first real check (`dist/index.js:48880` →
   `bootstrapCeoInvite()` at `dist/index.js:48996`, specifically line 40527) is:
   ```
   if (config.server.deploymentMode !== "authenticated") {
     log.info("Deployment mode is local_trusted. Bootstrap CEO invite is only required for authenticated mode.");
     return;
   }
   ```
   So the task-description ordering (step 2: run `bootstrap-ceo`, *then* step 3: flip the mode)
   is backwards for an already-onboarded instance — `bootstrap-ceo` would just print that
   message and exit. The mode must be flipped and persisted **first**.
3. **The real, vendor-supported way to flip the persisted mode is `paperclipai configure
   --section server`, not an env var or a hand-edited JSON file.** This command
   (`dist/index.js:64452`) runs the same interactive prompts as `onboard`'s reconfigure path and
   writes the result through the same Zod schema validation (`dist/index.js:17605-17733`) that
   `doctor`/`run` enforce — so a successful run is guaranteed structurally valid. See §2 below
   for the exact prompt answers that keep the bind on `127.0.0.1:3100` (required — see §1 of the
   prerequisite check).
4. **On this instance, restarting with `authenticated` + `embedded-postgres` already persisted
   will *auto-generate* the bootstrap CEO invite as part of server startup** —
   `shouldGenerateBootstrapInviteAfterStart()` (`dist/index.js:48984`) is
   `deploymentMode === "authenticated" && database.mode === "embedded-postgres"`, both true
   here, and `runCommand()` (`dist/index.js:48865-48871`) calls `bootstrapCeoInvite()`
   automatically right after the server comes up, printing the invite URL to the service's own
   log output. Manually running `paperclipai auth bootstrap-ceo` afterward is still useful (it's
   how you *retrieve* a fresh invite if the auto one already expired or wasn't captured from the
   logs in time, and it supports `--force` to mint a new one even if an admin already exists)
   but it is not the trigger — the restart is.
5. **`doctor`'s authenticated-mode check requires `BETTER_AUTH_SECRET` or
   `PAPERCLIP_AGENT_JWT_SECRET` in the process environment, with no auto-repair**
   (`dist/index.js:42649-42657`, `canRepair: false`). On this instance that should already be
   satisfied: `ensureAgentJwtSecret()` runs unconditionally during onboarding regardless of
   deployment mode (`dist/index.js:49280-49289`), the secret already exists in this instance's
   `.env` file (confirmed above), and `run.ts` loads it via `loadPaperclipEnvFile(configPath)`
   before `doctor` runs (`dist/index.js:48826`). **Still run `paperclipai doctor` after §2 and
   before restarting (§4)** to confirm this directly instead of trusting the inference — if it
   fails, the fix is `export BETTER_AUTH_SECRET=...` for the service's environment, not a CLI
   flag.

One more operational trap not in Rev 17 at all: **the CLI resolves config/home paths from the
*invoking* OS user's home directory by default**
(`resolvePaperclipHomeDir()`, `dist/index.js:20756`, falls back to `os.homedir()`). The Paperclip
service and its config live under the `paperclip` account's home
(`/home/paperclip/.paperclip/...`). If these commands are run as `ubuntu` — which they must be,
per the already-proven separate-account CLI pattern from Rev 15 on NEX-1, never as `paperclip`
— every command below needs an explicit `--config` pointing at the `paperclip` account's config
file, or `PAPERCLIP_HOME` exported to the `paperclip` account's `.paperclip` directory. Most
subcommands (`onboard`, `doctor`, `run`, `configure`, `auth bootstrap-ceo`) accept `-c, --config
<path>` directly. **The `service install|start|stop|restart|status|logs` subcommands do not** —
they only take `-i, --instance <id>` (`dist/index.js:43711`), so for those, `PAPERCLIP_HOME` (or
running them via a wrapper that already has it set, matching however Rev 15's pattern currently
invokes `service` commands) is the only lever. Get this wrong and a command silently targets (or
worse, creates) a different, empty instance under `ubuntu`'s own home, not the running one.

Every command block below assumes:
```bash
export PAPERCLIP_HOME=/home/paperclip/.paperclip
PAPERCLIP_CONFIG=/home/paperclip/.paperclip/instances/default/config.json
```
run as the `ubuntu` account, inside whatever session wrapper already proved out this pattern on
Rev 15. Adjust only if that pattern uses different paths — don't guess; confirm the paths match
what Rev 15 actually used before running anything below.

---

## 1. Prerequisite check — unresolved, root/owner-only, blocking (do this first)

This is the one open question Rev 17 flagged and could not answer from the unprivileged
`paperclip` account: **what credential, if any, does the nginx vhost for `10.66.66.1:13100`
forward to its upstream `127.0.0.1:3100`?**

This is unverified. It is the single blocking precondition for everything below. If nginx's
proxy_pass to `127.0.0.1:3100` relies on the `local_trusted` implicit-admin fallback (i.e. it
sends no credential at all, trusting that loopback traffic is automatically treated as
instance-admin), then flipping the mode to `authenticated` will make nginx's upstream requests
start failing with `401`/`403` the moment the new config takes effect — breaking the owner's own
remote dashboard over WireGuard, before `bootstrap-ceo` or anything else even runs.

```bash
# Run as root (or whoever owns the nginx config) — read-only, inspects config only:
sudo grep -n "proxy_pass\|proxy_set_header\|Authorization\|auth_basic" \
  /etc/nginx/sites-enabled/* /etc/nginx/sites-available/* /etc/nginx/conf.d/* 2>/dev/null \
  | grep -B3 -A3 "127.0.0.1:3100"
```

Interpret the result:
- If you see an `Authorization: Bearer <token>` or similar credential header being set on the
  `proxy_pass` to `127.0.0.1:3100`, you're clear — nginx already authenticates its own upstream
  call, and flipping to `authenticated` mode will not break it.
- If you see `auth_basic` (HTTP Basic Auth) terminating *at nginx* with no credential forwarded
  onward to the upstream — i.e. nginx itself prompts for a password, but talks to
  `127.0.0.1:3100` as a plain, credential-less proxy — that upstream call is exactly what relies
  on the `local_trusted` implicit-admin fallback today, and it **will break** on migration. Fix
  this nginx config (add a bearer/session credential to the proxy_pass, or front it with Paperclip's
  own authenticated-mode login instead of Basic Auth) before proceeding past this point.

Do not proceed to §2 until this is answered and, if necessary, fixed.

---

## 2. Flip the deployment mode (persisted config, not an env var)

```bash
sudo -u ubuntu env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  paperclipai configure --section server \
  --config /home/paperclip/.paperclip/instances/default/config.json
```

Answer the interactive prompts exactly as follows (defaults shown in `[brackets]` — press Enter
to accept a default only where noted):

| Prompt | Answer | Why |
|---|---|---|
| `Reachability` | **Custom** | The `Trusted local` preset hardcodes `local_trusted` (`dist/index.js:22141`); `Private network`/`Tailnet` presets also hardcode `authenticated` but rebind the host away from plain loopback. Only `Custom` lets you choose the auth mode independently of the bind host. |
| `Auth mode` | **Authenticated** | This is the field we're changing. |
| `Exposure profile` | **Private network** | Matches the current setup (WireGuard-only remote access via nginx, no public internet exposure). `Public internet` additionally requires an explicit HTTPS `publicBaseUrl`, which doesn't apply here. |
| `Bind host` | **press Enter to accept the default, `127.0.0.1`** | Must stay `127.0.0.1` — this is nginx's upstream target from §1. Confirmed from source that `authenticated` mode does not force a host change: the validator (`dist/index.js:13913`) only requires loopback-binding for `local_trusted`, and `buildCustomServerConfig` (`dist/index.js:22156`) auto-resolves a loopback host string back to `bind: "loopback"` — so this stays byte-for-byte the same bind Paperclip already uses, just with `deploymentMode: "authenticated"`. |
| `Server port` | **press Enter to accept the default, `3100`** | Unchanged. |
| `Allowed private hostnames` | **press Enter (blank)** | Not needed — nginx talks to `127.0.0.1`, not a hostname. |

This writes `config.json` and prints `Server configuration updated.` **It does not restart
anything** (`dist/index.js:50845`, `writeConfig()` only) — the running server process is still on
`local_trusted` until you restart it in §4.

Confirm the write took effect before moving on:
```bash
sudo -u ubuntu cat /home/paperclip/.paperclip/instances/default/config.json
# expect: "deploymentMode": "authenticated", "exposure": "private", "host": "127.0.0.1", "port": 3100
```

---

## 3. Pre-restart validation

```bash
sudo -u ubuntu env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  paperclipai doctor --config /home/paperclip/.paperclip/instances/default/config.json
```

Expect a `Deployment/auth mode` check reporting `pass` with a message like `Mode
authenticated/private with bind loopback and auth URL mode auto` (`dist/index.js:42696`). If it
instead fails with `authenticated mode requires BETTER_AUTH_SECRET (or
PAPERCLIP_AGENT_JWT_SECRET)` (`dist/index.js:42654`), do **not** proceed to §4 — that check has
no auto-repair; export `BETTER_AUTH_SECRET` into the service's environment first (see §0 item 5).
Per the read-only check at the top of this document, this secret already exists in this
instance's `.env`, so this failure is not expected here, but confirm rather than assume.

---

## 4. Restart the Paperclip service

```bash
sudo -u ubuntu env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  paperclipai service restart
```

This is a "hot-restart... preserving active agent runs" (`dist/index.js:43745`) — it does not
drop in-flight agent executions by default (pass `--wait` instead if you'd rather it wait for
active runs to drain before restarting). Because `deploymentMode` is now `authenticated` and
`database.mode` is `embedded-postgres` (confirmed above), the restarted process will automatically
call `bootstrapCeoInvite()` right after startup and log an invite URL
(`dist/index.js:48865-48871`, `shouldGenerateBootstrapInviteAfterStart` at line 48984). Capture it:

```bash
sudo -u ubuntu env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  paperclipai service logs -n 200 | grep -A2 "bootstrap CEO invite"
```

Look for lines like:
```
Created bootstrap CEO invite.
Invite URL: http://127.0.0.1:3100/invite/<token>
Expires: <ISO timestamp, 72h from creation by default>
```

If the auto-invite was missed (log already rotated, or the 72-hour window lapsed before you
visited it), mint a fresh one manually — this is the one point in this runbook where
`bootstrap-ceo` is actually the right command to run by hand, and only now that the config
already says `authenticated`:

```bash
sudo -u ubuntu env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  paperclipai auth bootstrap-ceo \
  --config /home/paperclip/.paperclip/instances/default/config.json
```
(add `--force` only if it reports "Instance already has an admin user" and you specifically want
a second invite anyway — `dist/index.js:40537`).

Open the printed invite URL in a browser, from a machine that can already reach
`10.66.66.1:13100` or `127.0.0.1:3100` today, and complete the owner account setup. This mints
the owner's **first real instance-admin credential** — keep it somewhere durable (a password
manager), since it replaces the implicit-admin fallback this whole migration removes.

---

## 5. Verification

1. **Dashboard login still works**, using the real credential just created in §4 (not the old
   implicit-admin access) — load the dashboard via the existing nginx/WireGuard path
   (`https://10.66.66.1:13100` or whatever URL is normally used) and confirm you can log in.
2. **Unauthenticated access to the API is now rejected.** From the Paperclip host itself (not
   through nginx):
   ```bash
   curl -i http://127.0.0.1:3100/api/agents/me
   ```
   Before this migration (today, `local_trusted`), this returns `200` with an implicit
   instance-admin identity — exactly the behavior Rev 17 confirmed and the whole reason B3 is
   blocked. After the migration, with no `Authorization` header, expect `401`. (The exact JSON
   error shape comes from the `@paperclipai/server` package, which is not part of the CLI tarball
   reviewed here, so only the status-code behavior — `200` vs `401` — is confirmed from this
   source review; confirm the body shape live rather than assuming it matches any particular
   format.)
3. **Service-level confirmation of the mode itself:**
   ```bash
   sudo -u ubuntu env PAPERCLIP_HOME=/home/paperclip/.paperclip paperclipai service status
   ```
   The health block includes `mode=<deploymentMode>` when the server exposes it
   (`dist/index.js:61075`) — confirm it reads `mode=authenticated`, not `mode=local_trusted`.
4. Re-run whatever same-host `nexus-testworker` SSH probe already exists (Rev 17 §6.3 / Rev 5-9
   on NEX-1) and confirm it now gets an authentication failure instead of a silent admin-identity
   bypass against `127.0.0.1:3100` — that result, not the checks above alone, is what actually
   clears B3.

---

## 6. Rollback

Symmetric to §2 and §4 — no destructive step, no state deleted:

```bash
sudo -u ubuntu env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  paperclipai configure --section server \
  --config /home/paperclip/.paperclip/instances/default/config.json
```
This time answer:

| Prompt | Answer |
|---|---|
| `Reachability` | **Trusted local** |

Choosing this preset alone is sufficient — `buildPresetServerConfig("loopback", ...)`
(`dist/index.js:22137`) hardcodes `deploymentMode: "local_trusted"`, `exposure: "private"`,
`bind: "loopback"`, `host: "127.0.0.1"` and skips every other prompt. This also happens to be the
schema's own documented default (`deploymentMode: z.enum(DEPLOYMENT_MODES).default("local_trusted")`,
`dist/index.js:17605`) — so "unset entirely" and "explicitly set back to `local_trusted`" are
equivalent; there is no ambiguity to resolve here as the task description speculated.

Then restart:
```bash
sudo -u ubuntu env PAPERCLIP_HOME=/home/paperclip/.paperclip paperclipai service restart
```

**What's preserved vs. lost on rollback:**

- **Preserved:** the SSH Environment (`04f19358-884c-4dbd-840a-4dcf582cd1fb`), all encrypted
  secrets (`secrets.localEncrypted`, untouched by `server.*` changes), the Discord notification
  service/integration, the embedded-postgres database and everything in it (agents, issues,
  history), and the owner's instance-admin account/credential row created in §4 — it stays in the
  database and will be detected by a future `bootstrap-ceo` run as "Instance already has an
  admin user" (`dist/index.js:40537`), so re-migrating later does not silently re-mint a new
  owner identity.
- **Lost (functionally, not literally deleted):** any login *sessions* established under
  `authenticated` mode stop being checked at all, because `local_trusted` bypasses the auth layer
  entirely rather than validating existing sessions against it — nothing is revoked in the
  database, the session-check code path is simply not consulted while `local_trusted` is active.
  Any API caller that started depending on sending a real bearer/session credential (including,
  per §1, nginx's own upstream call if it was fixed as part of this migration) will keep sending
  that credential after rollback; `local_trusted` mode will just also allow the same request with
  no credential at all, re-opening the implicit-admin gap this runbook exists to close.

---

## Appendix: file/command reference

| Thing | Value |
|---|---|
| Config file | `/home/paperclip/.paperclip/instances/default/config.json` |
| Instance env file (holds `PAPERCLIP_AGENT_JWT_SECRET`) | `/home/paperclip/.paperclip/instances/default/.env` |
| Instance id | `default` |
| Current (pre-migration) bind | `127.0.0.1:3100`, `local_trusted`, `private` |
| CLI package reviewed | `paperclipai-2026.1005.0.tgz` (`dist/index.js`) |
| Change mode | `paperclipai configure --section server` (`dist/index.js:64452`) |
| Mint/retrieve owner credential | `paperclipai auth bootstrap-ceo` (`dist/index.js:64498`) |
| Apply the change | `paperclipai service restart` (`dist/index.js:43745`) |
| Pre-flight check | `paperclipai doctor` (`dist/index.js:64445`) |
| Service status/logs | `paperclipai service status` / `paperclipai service logs -f` (`dist/index.js:43746-43758`) |
