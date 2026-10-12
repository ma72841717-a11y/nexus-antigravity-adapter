# B3 Migration Runbook: `local_trusted` → `authenticated` (and rollback)

**Status: documentation only. Nothing in this file has been executed.** Every claim below was
checked read-only — no `bootstrap-ceo`, no `configure` write, no `deploymentMode` change, no
service restart, no WireGuard/nginx/SSH/firewall/sudoers edit. This revision corrects five
findings from [NEX-13's independent review](https://github.com/ma72841717-a11y/nexus-antigravity-adapter/pull/4)
of the prior revision (`9e8f31a`), plus one additional risk this correction pass found while
verifying finding 2. Every correction below was checked directly against this host's real
permissions, the real nginx config, and the real `@paperclipai/server`/CLI source — not re-derived
from the prior revision's assumptions.

Audience: the owner (root/host access), executing by hand. Every command block below is meant to
be copy-pasted as-is; the surrounding prose explains what it does and why the ordering matters.

**Verified against:** the exact installed build, `paperclipai-2026.1005.0.tgz` (`dist/index.js`,
64,516 lines) and the matching `@paperclipai/server@2026.1005.0` package (unpacked locally under
`~/.npm/_npx/.../node_modules/@paperclipai/server`, same version string) — both extracted/read
locally, not reasoned about from memory. Also verified read-only against the live config on this
host, `/home/paperclip/.paperclip/instances/default/config.json`:

```json
{
  "deploymentMode": "local_trusted",
  "exposure": "private",
  "bind": "loopback",
  "host": "127.0.0.1",
  "port": 3100,
  "allowedHostnames": []
}
```
`database.mode` is `embedded-postgres`, `auth.baseUrlMode` is `"auto"`, and
`/home/paperclip/.paperclip/instances/default/.env` already contains a
`PAPERCLIP_AGENT_JWT_SECRET` entry. Both facts matter below.

---

## 0. Corrections applied in this revision (response to NEX-13)

| # | NEX-13 finding | What was verified on this host | Fix applied |
|---|---|---|---|
| 1 | Command identity makes migration/rollback non-executable | `stat`/`namei`: `/home/paperclip` is `0750 paperclip:paperclip`; `ubuntu` (uid 1001) is not in the `paperclip` group and cannot traverse into it at all — confirmed independently of the prior revision's assumption, matching Rev 15 (NEX-1)'s own finding that `ubuntu` cannot reach `/home/paperclip`. The service is a **systemd `--user` unit owned by `paperclip`** (`/home/paperclip/.config/systemd/user/paperclipai.service`, linger enabled), not a system service `ubuntu` can reach via `-i/--instance`. | §2–§4, §6 now run as `sudo -u paperclip`, not `sudo -u ubuntu`. See §0a. |
| 2 | Owner lockout / privilege ownership unresolved | Read the real nginx vhost (`/etc/nginx/conf.d/nexus-vpn.conf`, world-readable): `auth_basic` terminates at nginx with **no** `Authorization` header forwarded upstream, and nginx hardcodes `proxy_set_header Host 127.0.0.1:3100`. Traced `@paperclipai/server`'s `actorMiddleware`/`better-auth` source: authenticated-mode login uses a **cookie session** (`resolveSession`), which nginx passes through untouched (it is a transparent proxy for cookies) — so the Basic-Auth layer is irrelevant to Paperclip's own login. The actual risk is different and more concrete: `trustedOrigins` for CSRF/sign-in is derived from `server.allowedHostnames`, and with `authBaseUrlMode: "auto"` an **empty** `allowedHostnames` (the prior revision's recommendation) yields **zero** trusted origins — risking the owner's own sign-in being rejected as a cross-origin request through the WireGuard/nginx path. | §1 rewritten: drop the grep-only check, state the verified nginx facts, and require `Allowed private hostnames` to be set to the real WireGuard-facing address (not left blank), plus a live end-to-end login test — not a static check — before declaring success. |
| 3 | Bootstrap credential exposed via logs | `paperclipai service logs` shells out to `journalctl --user --unit=paperclipai.service`. Checked the actual journal ACLs (`getfacl /var/log/journal/.../*.journal`): files are `root:systemd-journal 0640` with an additional ACL for group `adm`. `paperclip` (uid 995, group `paperclip` only) is in **neither** group — `journalctl` run as `paperclip` fails with "insufficient permissions" (reproduced). `ubuntu` **is** in `adm` (`getent group adm` → `ubuntu,ocarun`), so `ubuntu` can read the same entries via the system journal with no sudo at all, while an unprivileged same-host account (e.g. `nexus-testworker`) cannot — matching the B3 threat model. | §4 rewritten to use `journalctl --user-unit=paperclipai.service` as `ubuntu` (not `paperclipai service logs` as `paperclip`, which cannot read its own journal here), with explicit handling guidance and a corrected `--force` warning. |
| 4 | Interrupted flip only conditionally recoverable | Read `writeConfig()` in the CLI source: every write makes a `config.json.backup` copy of the prior file before the new one is written atomically. Confirmed this file-level backup is real and independent of the rollback command, which the prior revision did not surface. | §6 now leads with the verified `config.json.backup` recovery path and states plainly, in the identity-corrected (`paperclip`-run) form, when it applies vs. when the CLI rollback is still required. |
| 5 | Mode verification command wrong | Ran `paperclipai service status --instance default` on this host: output is `{"health":{"ok":true,"serverVersion":"2026.1005.0"}}` — **no `mode` field at all**. Ran `paperclipai doctor`: its "Deployment/auth mode" check correctly reported `local_trusted mode is configured for loopback-only access`. | §5 item 3 now uses `doctor`, not `service status`, for mode confirmation. |

### 0a. Why `paperclip`, not `ubuntu` — and why Rev 15's "ubuntu CLI pattern" doesn't apply here

Rev 15 (NEX-1) proved that `ubuntu` can run **its own, separately `npm install -g`'d copy** of the
CLI to do a **board login** (`paperclipai auth login`) against Paperclip's cloud API, using
`ubuntu`'s own `$HOME/.paperclip/auth.json` — a deliberate choice to keep that credential off the
`paperclip` account entirely. That pattern never touches `/home/paperclip`, and Rev 15 says so
explicitly: `ubuntu` cannot traverse into `/home/paperclip` at all. The prior runbook revision cited
"the already-proven separate-account CLI pattern from Rev 15" to justify running `configure` /
`service restart` as `ubuntu` with a `--config` flag pointed at `/home/paperclip/...` — but that is a
different operation (editing *this instance's own* persisted config and controlling *this instance's
own* systemd `--user` service), and Rev 15's own evidence rules it out: the path is unreachable for
`ubuntu` no matter what flag is passed.

The service in question is `systemctl --user` under `paperclip` (uid 995), with lingering enabled
(`loginctl show-user paperclip` → `State=lingering`, confirmed), so it keeps running without an
active login session. The correct, verified command identity is: the owner, who has root/sudo,
switches into the `paperclip` account for the config/restart steps (sudo can assume any account
regardless of that account's own directory permissions — this is not the same wall that blocks
`ubuntu` acting as itself), and separately uses the `ubuntu` account (already in the `adm` group)
to read the journal for the invite URL in §4. Every command block below assumes:

```bash
export PAPERCLIP_HOME=/home/paperclip/.paperclip
export XDG_RUNTIME_DIR=/run/user/995   # required for `systemctl --user` / `paperclipai service *`
PAPERCLIP_CONFIG=/home/paperclip/.paperclip/instances/default/config.json
```
confirmed by reproducing the failure directly: `systemctl --user status paperclipai.service` fails
with "Failed to connect to bus" unless `XDG_RUNTIME_DIR=/run/user/995` is exported first (reproduced
on this host); `995` is `paperclip`'s UID (`id -u paperclip`), confirm it matches on the actual
target host before running anything below — it will differ if `paperclip`'s UID differs there.

---

## 1. Prerequisite check — verified facts, plus the one still-open owner action

**Verified, not guessed:** the nginx vhost serving `10.66.66.1:13100` is
`/etc/nginx/conf.d/nexus-vpn.conf` (world-readable on this host; read directly, no `sudo` needed):

```nginx
server {
    listen 10.66.66.1:13100;
    auth_basic "NEXUS Private Dashboard";
    auth_basic_user_file /etc/nginx/private/nexus-users;
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host 127.0.0.1:3100;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $nexus_connection_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

What this means, traced against the actual `@paperclipai/server` auth middleware
(`middleware/auth.js`, `actorMiddleware`) and `auth/better-auth.js`:

- nginx's `auth_basic` is a **separate** gate in front of Paperclip, unrelated to Paperclip's own
  auth mode. It does **not** forward any credential to `127.0.0.1:3100` — confirmed, there is no
  `proxy_set_header Authorization ...` line. The prior revision's §1 check (grep for a forwarded
  `Authorization` header) was checking for the wrong thing: Paperclip's `authenticated`-mode login
  does not rely on nginx injecting a bearer token into its own upstream call at all. It resolves a
  **browser session cookie** (`opts.resolveSession`), and nginx — which does not strip `Cookie` or
  `Authorization` headers on this path — passes the real client's own credentials through
  transparently. So the specific failure mode the old §1 worried about ("nginx's own upstream call
  has no credential, therefore it breaks") does not apply; nginx is not the caller that needs a
  credential, the owner's browser is, and the browser's cookie reaches Paperclip untouched.
- **The real, verified risk is different:** `server.allowedHostnames` feeds directly into
  `deriveAuthTrustedOrigins()`, which becomes `trustedOrigins` on the `better-auth` instance. With
  `auth.baseUrlMode: "auto"` (this instance's current setting), `baseURL` is left undefined and
  `trustedOrigins` is built **only** from `allowedHostnames`. **Leaving `allowedHostnames` empty —
  what the prior revision's §2 table told the owner to do — means zero trusted origins are
  configured.** A sign-in request whose browser `Origin` is `http://10.66.66.1:13100` (the real
  WireGuard/nginx address) could then be rejected as untrusted, even though the credential itself is
  valid — exactly the "owner lockout" scenario NEX-13 flagged, just through a different mechanism
  than a missing proxy header.
- nginx also rewrites `Host` to the literal string `127.0.0.1:3100` on every proxied request
  (`proxy_set_header Host 127.0.0.1:3100`), so the application itself never sees the real
  `10.66.66.1:13100` host the owner's browser used. This is one more reason a static config grep
  cannot stand in for a live test here — the request the app actually receives is not the request
  the browser actually sent.

**Action (owner, before §2):** when you reach §2's prompts, set `Allowed private hostnames` to the
real address the dashboard is reached at over WireGuard (e.g. `10.66.66.1`) — do **not** leave it
blank. If the owner-facing URL also uses a scheme/port not covered by `deriveAuthTrustedOrigins`'s
`https://<host>` / `http://<host>:<port>` pattern (own install may front this differently), note the
exact URL used and adjust: the command in §5 item 1 is the test that actually proves this is right,
not this section's static read.

This is still the one blocking precondition Rev 17 originally flagged, now answered with the actual
config contents instead of "unverified" — but answering it changed the recommended action (set the
hostname) rather than closing the question outright. Do not proceed to §2 until §5 item 1 has been
rehearsed mentally against this config and you're prepared to supply the right hostname value.

---

## 2. Flip the deployment mode (persisted config, not an env var)

```bash
sudo -u paperclip env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  /home/paperclip/.local/bin/paperclipai configure --section server \
  --config /home/paperclip/.paperclip/instances/default/config.json
```

Answer the interactive prompts exactly as follows (defaults shown in `[brackets]` — press Enter to
accept a default only where noted):

| Prompt | Answer | Why |
|---|---|---|
| `Reachability` | **Custom** | The `Trusted local` preset hardcodes `local_trusted` (`dist/index.js:22141`); `Private network`/`Tailnet` presets also hardcode `authenticated` but rebind the host away from plain loopback. Only `Custom` lets you choose the auth mode independently of the bind host. |
| `Auth mode` | **Authenticated** | This is the field we're changing. |
| `Exposure profile` | **Private network** | Matches the current setup (WireGuard-only remote access via nginx, no public internet exposure). |
| `Bind host` | **press Enter to accept the default, `127.0.0.1`** | Must stay `127.0.0.1` — nginx's upstream target (§1). `authenticated` mode does not force a host change (`dist/index.js:13913`, `22156`). |
| `Server port` | **press Enter to accept the default, `3100`** | Unchanged. |
| `Allowed private hostnames` | **`10.66.66.1`** (or whatever address the dashboard is actually reached at over WireGuard — confirm against your own nginx/WireGuard setup if different from this host's) | **Corrected in this revision — see §1.** This is not optional whitespace: it is the `trustedOrigins` input for the authenticated-mode login. Leaving it blank risks the owner's own sign-in being rejected as a foreign origin. |

This writes `config.json` and prints `Server configuration updated.` **It does not restart
anything** (`writeConfig()` only, `dist/index.js:50845`) — the running server process stays on
`local_trusted` until you restart it in §4. It also makes a backup copy first — see §6 for how
that backup is used in recovery.

Confirm the write took effect before moving on:
```bash
sudo -u paperclip cat /home/paperclip/.paperclip/instances/default/config.json
# expect: "deploymentMode": "authenticated", "allowedHostnames": ["10.66.66.1"], "host": "127.0.0.1", "port": 3100
```

---

## 3. Pre-restart validation

```bash
sudo -u paperclip env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  /home/paperclip/.local/bin/paperclipai doctor \
  --config /home/paperclip/.paperclip/instances/default/config.json
```

Expect a `Deployment/auth mode` check reporting `pass`. On this host, the same command run against
the current (`local_trusted`) config reported:
```
✓ Deployment/auth mode: local_trusted mode is configured for loopback-only access
```
so after §2 it should instead report an `authenticated`-mode pass message. If it instead fails with
`authenticated mode requires BETTER_AUTH_SECRET (or PAPERCLIP_AGENT_JWT_SECRET)`, do **not** proceed
to §4 — that check has no auto-repair; export `BETTER_AUTH_SECRET` into the service's environment
first. This instance's `.env` already has `PAPERCLIP_AGENT_JWT_SECRET` set (confirmed), so this
failure is not expected here, but confirm rather than assume — this `doctor` run is read-only (no
`--repair`/`--fix` flag passed) and makes no changes either way.

---

## 4. Restart the Paperclip service, then retrieve the bootstrap invite **as `ubuntu`, not `paperclip`**

```bash
sudo -u paperclip env PAPERCLIP_HOME=/home/paperclip/.paperclip XDG_RUNTIME_DIR=/run/user/995 \
  /home/paperclip/.local/bin/paperclipai service restart
```
(`995` is `paperclip`'s UID on this host — confirm with `id -u paperclip` on the actual target
before running this.) This is a hot-restart that preserves active agent runs by default
(`dist/index.js:43745`; pass `--wait` instead if you'd rather it wait for active runs to drain).
Because `deploymentMode` is now `authenticated` and `database.mode` is `embedded-postgres`, the
restarted process automatically calls `bootstrapCeoInvite()` right after startup and logs an invite
URL (`shouldGenerateBootstrapInviteAfterStart`, `dist/index.js:48984`).

**Corrected in this revision:** do not use `paperclipai service logs` as `paperclip` to retrieve it
— reproduced on this host, it fails:
```
$ sudo -u paperclip env XDG_RUNTIME_DIR=/run/user/995 paperclipai service logs -n 200
No journal files were opened due to insufficient permissions.
```
This is because the service's stdout goes to the **system** journal (`root:systemd-journal`, mode
`0640`), and `paperclip` is in neither the `systemd-journal` nor `adm` group. This is actually the
correct, least-privilege outcome, not a bug to route around with `sudo`/root: it means an arbitrary
same-host account (the exact `nexus-testworker`-shaped threat B3 exists for) also cannot read it.
The account that **should** read it is `ubuntu`, who is already in `adm`
(`getent group adm` → `ubuntu,...`) and therefore needs no `sudo` at all for this one step:

```bash
# As ubuntu, no sudo needed — adm group membership is sufficient:
journalctl --user-unit=paperclipai.service -n 200 --no-pager | grep -A2 "bootstrap CEO invite"
```

Look for lines like:
```
Created bootstrap CEO invite.
Invite URL: http://127.0.0.1:3100/invite/<token>
Expires: <ISO timestamp, 72h from creation by default>
```

Treat that URL as a live, one-time bearer secret for the next 72 hours: read it directly from the
terminal, open it immediately in a browser from a machine that can already reach `10.66.66.1:13100`,
and do not paste it into chat, a ticket, or any other log. Because only `root` and the `adm`/
`systemd-journal` groups can read the journal at all (verified above), the exposure here is already
scoped to accounts the owner already trusts with root-adjacent access — not to every same-host
account, which is the actual B3 threat model. Still, don't widen that by copying the token elsewhere.

If the auto-invite was missed (log rotated, or the 72-hour window lapsed), mint a fresh one — this
is the one point in this runbook where running `bootstrap-ceo` by hand is correct, and only now that
the config already says `authenticated`:

```bash
sudo -u paperclip env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  /home/paperclip/.local/bin/paperclipai auth bootstrap-ceo \
  --config /home/paperclip/.paperclip/instances/default/config.json
```
Do **not** add `--force` as a routine step: once an instance admin exists, `--force` still mints
another live invite (`dist/index.js:40541-40566`) — first-admin-claim only blocks a *second user*
from completing the claim (verified in `first-admin-claim.js`: the claim is inside a DB transaction
with a share-row-exclusive lock and an `already_claimed` short-circuit), but it does not stop a
second live invite URL from being minted and exposed. Use `--force` only if you specifically intend
to hand a fresh invite to a second identity, understanding the first-claim lock will reject it.

Open the printed invite URL and complete the owner account setup. This mints the owner's **first
real instance-admin credential** — keep it in a password manager; it replaces the implicit-admin
fallback this migration removes.

---

## 5. Verification

1. **Dashboard login actually works end-to-end, through the real path — not inferred from config.**
   Load the dashboard via `https://10.66.66.1:13100` (or whatever URL is normally used) and log in
   with the credential from §4. This is the live test that §1 could only predict, not prove — if the
   `allowedHostnames` value from §2 is wrong, this is where it surfaces, as a rejected sign-in rather
   than a silent failure.
2. **Unauthenticated access to the API is now rejected.** From the Paperclip host itself (not
   through nginx):
   ```bash
   curl -i http://127.0.0.1:3100/api/agents/me
   ```
   Before migration (`local_trusted`), this returns `200` with an implicit instance-admin identity —
   confirmed on this host. After migration, with no `Authorization` header, expect `401`. The exact
   JSON error shape comes from `@paperclipai/server`, not the CLI; only the status-code behavior is
   asserted here.
3. **Mode confirmation — corrected in this revision.** `service status` does **not** report the
   deployment mode; reproduced on this host, its output is only `{"health":{"ok":true,
   "serverVersion":"2026.1005.0"}}`, with no `mode` field at all. Use `doctor` instead:
   ```bash
   sudo -u paperclip env PAPERCLIP_HOME=/home/paperclip/.paperclip \
     /home/paperclip/.local/bin/paperclipai doctor \
     --config /home/paperclip/.paperclip/instances/default/config.json
   ```
   Confirm the `Deployment/auth mode` line now reads an `authenticated`-mode pass message (compare
   against the verified `local_trusted` wording quoted in §3).
4. Re-run whatever same-host `nexus-testworker` SSH probe already exists (Rev 17 §6.3 / Rev 5-9 on
   NEX-1) and confirm it now gets an authentication failure instead of a silent admin-identity
   bypass against `127.0.0.1:3100` — that result, not the checks above alone, is what actually
   clears B3.

---

## 6. Rollback

**If the config write in §2 itself is interrupted** (process killed mid-write), the CLI's own
`writeConfig()` already protects you: verified in source, it copies the existing `config.json` to
`config.json.backup` *before* writing the new file, and the new file is written atomically. So the
config directory already contains a known-good pre-migration copy:
```bash
sudo -u paperclip test -f /home/paperclip/.paperclip/instances/default/config.json.backup && \
  sudo -u paperclip cp /home/paperclip/.paperclip/instances/default/config.json.backup \
                       /home/paperclip/.paperclip/instances/default/config.json
```
Use this only if `config.json` itself looks wrong or `doctor` reports a schema/parse failure right
after §2 — if the write completed cleanly (confirmed by the `cat` check at the end of §2), this step
is not needed; use the CLI rollback below instead.

**If the service crashes or restarts after `authenticated` is already persisted but before the
owner redeems the invite from §4:** the next start loads `authenticated` mode
(`shouldGenerateBootstrapInviteAfterStart`/`runCommand`, `dist/index.js:48865-48885`) and the old
implicit-admin dashboard access is gone until a credential exists. This is recoverable, not
destructive: retrieve the (re-)generated invite the same way as §4 (`journalctl --user-unit=
paperclipai.service` as `ubuntu`), or mint one with `bootstrap-ceo` (no `--force` needed if no
admin has been claimed yet). Only fall back to the full CLI rollback below if you want to abandon
the migration rather than complete it.

**Full CLI rollback** — symmetric to §2 and §4, no destructive step, no state deleted:
```bash
sudo -u paperclip env PAPERCLIP_HOME=/home/paperclip/.paperclip \
  /home/paperclip/.local/bin/paperclipai configure --section server \
  --config /home/paperclip/.paperclip/instances/default/config.json
```
This time answer:

| Prompt | Answer |
|---|---|
| `Reachability` | **Trusted local** |

This preset alone is sufficient — `buildPresetServerConfig("loopback", ...)` (`dist/index.js:22137`)
hardcodes `deploymentMode: "local_trusted"`, `exposure: "private"`, `bind: "loopback"`,
`host: "127.0.0.1"` and skips every other prompt, including `allowedHostnames`.

Then restart:
```bash
sudo -u paperclip env PAPERCLIP_HOME=/home/paperclip/.paperclip XDG_RUNTIME_DIR=/run/user/995 \
  /home/paperclip/.local/bin/paperclipai service restart
```

**What's preserved vs. lost on rollback:**

- **Preserved:** the SSH Environment, all encrypted secrets, the Discord integration, the
  embedded-postgres database and everything in it, and the owner's instance-admin account/credential
  created in §4 — it stays in the database and will be detected by a future `bootstrap-ceo` run as
  "Instance already has an admin user" (`dist/index.js:40543`), so re-migrating later does not
  silently re-mint a new owner identity.
- **Lost (functionally, not literally deleted):** any login *sessions* established under
  `authenticated` mode stop being checked at all once `local_trusted` bypasses the auth layer again
  — nothing is revoked in the database. Any API caller that started depending on sending a real
  session credential will keep sending it after rollback; `local_trusted` will also allow the same
  request with no credential at all, re-opening the implicit-admin gap this runbook exists to close.

---

## Appendix: file/command reference

| Thing | Value |
|---|---|
| Config file | `/home/paperclip/.paperclip/instances/default/config.json` |
| Config backup (auto-created by every `configure` write) | `/home/paperclip/.paperclip/instances/default/config.json.backup` |
| Instance env file (holds `PAPERCLIP_AGENT_JWT_SECRET`) | `/home/paperclip/.paperclip/instances/default/.env` |
| Instance id | `default` |
| Current (pre-migration) bind | `127.0.0.1:3100`, `local_trusted`, `private` |
| Service account / unit | `paperclip` (uid verify with `id -u paperclip`), `systemctl --user paperclipai.service`, linger enabled |
| CLI package reviewed | `paperclipai-2026.1005.0.tgz` (`dist/index.js`) |
| Server package reviewed | `@paperclipai/server@2026.1005.0` (`middleware/auth.js`, `auth/better-auth.js`, `first-admin-claim.js`) |
| nginx vhost (owner-facing, WireGuard) | `/etc/nginx/conf.d/nexus-vpn.conf` — `auth_basic`, `proxy_pass http://127.0.0.1:3100`, no `Authorization` forwarded |
| Change mode | `sudo -u paperclip ... paperclipai configure --section server` |
| Mint/retrieve owner credential | `sudo -u paperclip ... paperclipai auth bootstrap-ceo` |
| Retrieve bootstrap invite from logs | `ubuntu$ journalctl --user-unit=paperclipai.service` (not `paperclipai service logs` as `paperclip` — reproduced failing) |
| Apply the change | `sudo -u paperclip env XDG_RUNTIME_DIR=/run/user/<paperclip-uid> ... paperclipai service restart` |
| Pre-flight / mode check | `sudo -u paperclip ... paperclipai doctor` (not `service status` — reproduced missing `mode` field) |
