# NEXUS Antigravity Adapter

Autonomous, independently-reviewed Paperclip external adapter for Google's Antigravity CLI (`agy`). Forked from the upstream MIT-licensed [`adapter-antigravity-local`](https://github.com/weslleycapelari/adapter-antigravity-local) project and hardened for headless execution, structured session capture, and workspace isolation — see [`docs/UPSTREAM_PROVENANCE.md`](docs/UPSTREAM_PROVENANCE.md) for the exact diff from upstream.

**Status:** PR #1 (`claude/adapter-implementation-p0` → `main`) is open and under independent review; not yet merged. `npm run typecheck`, `npm run build`, and `npm test` all pass locally — see [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for the current test count and review history.

This repository is developed and reviewed by the NEXUS AI team (NEXUS director, Claude implementation agent, Codex independent reviewer) under an owner-approved project charter. The resulting adapter is **not installed or enabled in any live Paperclip instance** by this project — see [`docs/SECURITY_BOUNDARIES.md`](docs/SECURITY_BOUNDARIES.md) for the permission boundary this project operates under. Final installation into a live instance is an owner/ARGUS decision made after release-candidate review, using [`docs/OWNER_INSTALL_GUIDE.md`](docs/OWNER_INSTALL_GUIDE.md).

## Scope

- A Paperclip `createServerAdapter`-compatible adapter targeting `agy` 1.3.3.
- Headless execution (`--print` mode), session/conversation resume bound to workspace identity, workspace boundaries via `--add-dir`.
- Usage/cost accounting is **not** implemented — see Limitations below.
- See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SECURITY_BOUNDARIES.md`](docs/SECURITY_BOUNDARIES.md), [`docs/UPSTREAM_PROVENANCE.md`](docs/UPSTREAM_PROVENANCE.md).

## Install & configure

This package is consumed by a Paperclip instance as a `createServerAdapter`-compatible module; it is not meant to be run standalone. See [`docs/OWNER_INSTALL_GUIDE.md`](docs/OWNER_INSTALL_GUIDE.md) for the full walkthrough. Minimal shape of an agent config using this adapter:

```json
{
  "adapterType": "antigravity_local",
  "config": {
    "command": "agy",
    "model": "auto",
    "sandbox": true,
    "dangerouslySkipPermissions": false,
    "requireIsolatedExecutionTarget": true
  }
}
```

- **`agy` must already be installed and authenticated** on the execution target before this adapter can run anything real — either via the native OS keyring or an `ANTIGRAVITY_API_KEY` environment variable (run `agy install`/the CLI's own login flow on that target first). `testEnvironment()` (the Paperclip "test connection" action) surfaces missing auth as a `antigravity_hello_probe_auth_required` warning rather than failing silently.
- **`requireIsolatedExecutionTarget` defaults to `true`** (fail-safe): `execute()` refuses to run unless the resolved execution target is remote/isolated (an SSH worker or sandbox that Paperclip itself orchestrates), i.e. not the Paperclip server's own OS identity. Set it to `false` only after reviewing the risk described in [`docs/SECURITY_BOUNDARIES.md`](docs/SECURITY_BOUNDARIES.md) — same-host workers can typically reach the Paperclip server's own loopback API.
- **`sandbox` defaults to `true`** (fail-safe): appends `--sandbox` to every CLI invocation unless explicitly disabled.
- **`dangerouslySkipPermissions` defaults to `false`** and must be explicitly opted into; enabling it logs a warning on every run.

See `agentConfigurationDoc` in [`src/index.ts`](src/index.ts) for the complete field list.

## Limitations

- **No usage/cost accounting.** `execute()` always returns `usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }` and `costUsd: null` — the `agy` CLI's `--print` mode does not emit structured token/cost telemetry, so none is parsed or estimated. `resultJson.raw` and `summary` are the CLI's raw (redacted) stdout, not a parsed JSON result.
- **No single-workspace-root containment for `--add-dir`.** Workspace cwds passed to `--add-dir` must already be absolute (enforced; see [`docs/UPSTREAM_PROVENANCE.md`](docs/UPSTREAM_PROVENANCE.md)), but are not constrained to nest under one configured root — Paperclip legitimately registers multiple independent workspace directories. See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for the rationale.
- **`server/skills.ts` (plugin symlink management) has minimal dedicated test coverage** compared to the rest of the adapter; see [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).
- **No live `agy` CLI is ever exercised by this repo's own tests or CI** — all tests run against a fully mocked execution-target runtime and a scripted fake CLI process. Behavior against the real `agy` binary has not been independently verified by this project.

## Contributing

All changes land via pull request against `main`, gated on CI and independent review. See `.github/workflows/ci.yml`.

## License

MIT — see [`LICENSE`](LICENSE). Portions derived from the upstream project retain their original copyright notice; see [`docs/UPSTREAM_PROVENANCE.md`](docs/UPSTREAM_PROVENANCE.md).
