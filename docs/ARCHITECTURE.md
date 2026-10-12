# Architecture

This adapter is a `@paperclipai/adapter-utils` `ServerAdapterModule` implementation that lets
Paperclip drive the Google Antigravity CLI (`agy`) headlessly. It is a thin orchestration layer:
all real work (process spawning, SSH/sandbox preparation, the Paperclip↔target bridge) is done by
`@paperclipai/adapter-utils/execution-target`; this package's own code decides *what* to run and
*how to interpret* what came back.

## Module map

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | `createServerAdapter()` entry point: adapter metadata (`type`, `label`, `models`), `agentConfigurationDoc`, and wiring of `execute`/`testEnvironment`. |
| `src/server/execute.ts` | Core run loop: resolves the execution target and cwd, builds the `agy` argv (`compileAgyArguments`), decides whether a stored session can be resumed, spawns the process via `runAdapterExecutionTargetProcess`, and maps the result back into an `AdapterExecutionResult`. |
| `src/server/test.ts` | `testEnvironment()`: the Paperclip "test connection" diagnostic pipeline — working directory, same-host isolation risk, command resolvability, credential presence, and a live "hello" telemetry probe (built from a fixed, non-configurable argument list; see below). |
| `src/server/parse.ts` | Pure stdout/stderr parsers: auth-required / quota-exhausted detection, and `extractAntigravitySessionId` (recovers a freshly-minted conversation id from a successful run's own output). |
| `src/server/redact.ts` | `redactSecrets`: strips known credential values out of raw CLI output before it can reach an error message, summary, or `resultJson.raw`. |
| `src/server/skills.ts` | Syncs Paperclip-managed skills into `~/.agy/plugins` via symlinks on the execution target. |
| `src/server/index.ts` | Re-exports the above, plus `parseSessionParams`/`sessionCodec` (session persistence shape Paperclip stores between runs). |
| `src/ui/build-config.ts` | Maps Paperclip's standard `CreateConfigValues` UI shape (sandbox toggle, dangerous-permissions toggle, etc.) into this adapter's `config` fields. |
| `src/ui/parse-stdout.ts` | Line-level stdout classifier used to drive any live UI streaming. |
| `src/cli/format-event.ts` | Formats a parsed stdout event for terminal/CLI-style display. |
| `src/types.ts` | Shared type definitions (`AntigravitySessionParams`, model definitions). |
| `src/utils.ts` | Small shared string/parsing helpers with no adapter-specific logic. |

## Request flow (`execute()`)

1. Resolve the `AdapterExecutionTarget` (SSH worker, sandbox, or same-host) and refuse to
   proceed if it resolves to the Paperclip server's own OS identity and
   `requireIsolatedExecutionTarget` (default `true`) hasn't been explicitly disabled.
2. Resolve the effective working directory and build the process environment
   (`PAPERCLIP_*` vars, optional `ANTIGRAVITY_MODEL`/`PAPERCLIP_API_KEY`).
3. If the target is remote, prepare its runtime (sync the workspace, optionally start the
   Paperclip↔target API bridge) via `@paperclipai/adapter-utils/execution-target`.
4. Decide whether a session id stored from a previous run is resumable: it must match on
   execution-target identity *and* on workspace identity (`workspaceId` when either side
   declares one, else the resolved execution cwd) — see `docs/UPSTREAM_PROVENANCE.md` for
   why this binding exists.
5. Build the `agy` argv via `compileAgyArguments`: `--print <prompt>`, optional
   `--conversation <id>`, one `--add-dir <absolute-path>` per registered workspace,
   `--sandbox` (default on), `--dangerously-skip-permissions` (opt-in only, logged when
   used), then any configured `extraArgs`/`args`.
6. Spawn the process, then redact known secrets out of stdout/stderr before using either in
   an error message, the summary, or `resultJson.raw`. A fresh (non-resuming) successful run
   attempts to recover a newly-minted conversation id from the CLI's own output so the next
   turn can resume it.

## What this adapter does *not* do

- Parse `agy`'s output into structured usage/cost telemetry — `usage` is always zeroed and
  `costUsd` is always `null`; `resultJson.raw`/`summary` are the raw (redacted) stdout. See
  the README's Limitations section.
- Enforce a single "workspace root" that every `--add-dir` path must nest under — Paperclip
  legitimately registers multiple independent workspace directories per run.
- Exercise a live `agy` binary in its own tests or CI — every test runs against a fully
  mocked execution-target runtime and a scripted fake CLI process.

See `docs/UPSTREAM_PROVENANCE.md` for the file-by-file diff from the upstream project this
was forked from, and `docs/SECURITY_BOUNDARIES.md` for the isolation/permission model this
adapter is designed to run under.
