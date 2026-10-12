# Owner Install Guide

This guide is for the Paperclip owner/operator deciding whether and how to register this
adapter on a live Paperclip instance. Nothing in this repository installs, enables, or
reloads the adapter in any live instance itself — see
[`docs/SECURITY_BOUNDARIES.md`](SECURITY_BOUNDARIES.md) for this project's permission
boundary. This is a description of the decision and the config, not an action taken on
your behalf.

## Prerequisites

1. **`agy` (the Antigravity CLI) installed and authenticated on the execution target** —
   not on the Paperclip server itself. Install via `curl -sSL https://antigravity.google/install.sh | bash`
   (the same command this adapter uses for sandbox auto-install; see `SANDBOX_INSTALL_COMMAND`
   in `src/index.ts`), then authenticate using either:
   - the native OS keyring (interactive `agy` login flow on that target), or
   - an `ANTIGRAVITY_API_KEY` environment variable set on the execution target/agent config.

   Use the adapter's `testEnvironment()` diagnostic (Paperclip's "test connection" action)
   to check this before running anything real — a missing-auth probe reports
   `antigravity_hello_probe_auth_required`, not a silent failure.

2. **An isolated execution target** — an SSH worker or sandbox environment that Paperclip
   itself orchestrates, distinct from the Paperclip server's own OS identity. This is
   enforced in code, not just by convention: `execute()` throws
   `AntigravitySameHostExecutionRefusedError` and refuses to run otherwise, unless you
   explicitly set `requireIsolatedExecutionTarget: false` in the agent config after reading
   the risk below.

## Minimal config

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

Attach this agent to an SSH or sandbox execution environment in Paperclip (not "run on this
server"). See `agentConfigurationDoc` in [`src/index.ts`](../src/index.ts) for every
supported field (`cwd`, `instructionsFilePath`, `promptTemplate`, `extraArgs`, `env`,
`timeoutSec`, `graceSec`, and the safety fields below).

## Safety fields and their defaults — read before changing any of them

| Field | Default | What changing it does |
| --- | --- | --- |
| `requireIsolatedExecutionTarget` | `true` | Set to `false` to allow this agent to run directly under the Paperclip server's own OS identity. Same-host workers can typically reach the Paperclip server's own loopback API — only disable this after reviewing [`docs/SECURITY_BOUNDARIES.md`](SECURITY_BOUNDARIES.md). |
| `sandbox` | `true` | Set to `false` to omit `--sandbox` from every CLI invocation (runs without the CLI's own sandboxing). |
| `dangerouslySkipPermissions` | `false` | Set to `true` to append `--dangerously-skip-permissions`, bypassing the CLI's own OS permission prompts. A warning is logged on every run this is enabled for. |

None of these three ever default to the less-safe option; each requires an explicit,
reviewed opt-in in the agent config.

## Limitations to weigh before enabling in a live instance

See the README's Limitations section and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — in
short: no usage/cost telemetry is parsed from `agy`'s output, `--add-dir` workspace paths
are not constrained to a single root, and this project's own tests never exercise a live
`agy` binary (only a mocked execution-target runtime and a scripted fake process).

## Release-candidate review

Final installation is an owner/ARGUS decision made **after** release-candidate review of
the open pull request against `main` — see [`docs/CURRENT_STATE.md`](CURRENT_STATE.md) for
the current review status and test counts.
