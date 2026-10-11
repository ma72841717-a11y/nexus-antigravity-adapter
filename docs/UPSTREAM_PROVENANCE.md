# Upstream Provenance

- **Source:** https://github.com/weslleycapelari/adapter-antigravity-local
- **Pinned commit:** `691725a674ec28b566868b39898ffa3ff0eae4f2` (observed 2026-10-10)
- **License:** MIT, copyright (c) 2026 Weslley Capelari — verified by direct fetch of `LICENSE` at the pinned SHA.
- **Package:** `@weslleycapelari/adapter-antigravity-local` v1.0.0
  - Runtime deps: `@paperclipai/adapter-utils ^2026.525.0`, `picocolors ^1.1.1`
  - Dev deps: `@types/node ^24.6.0`, `typescript ^5.7.3`, `vitest ^4.1.7`
  - Scripts: `build` (tsc + copy package.json to dist), `typecheck` (tsc --noEmit), `test` (vitest run)
- **Layout observed at pinned SHA:** `.github/`, `.gitignore`, `LICENSE`, `README.md`, `SETUP.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `src/`, `tests/`.

## Audit status

Directory listing, `LICENSE`, and `package.json` reviewed read-only prior to any import, then
full `src/` and `tests/` contents reviewed before vendoring (see commit on
`claude/adapter-implementation-p0`). `.github/` workflows and `SETUP.md` were read but are
install/CI documentation, not executed code, so they carry no behavioral risk to vet.
No npm lifecycle scripts (`preinstall`/`postinstall`/etc.) are declared in `package.json`;
transitive dependency scripts were not separately audited in this pass (tracked as a P1
follow-up, see docs/CURRENT_STATE.md).

Upstream's exact `LICENSE` text and copyright notice are preserved verbatim in
`THIRD_PARTY_NOTICES.md` at the repo root, alongside this repo's own `LICENSE`.

## Vendoring status (P0 implementation)

Vendored into `src/` with per-file attribution headers, split into "unchanged" and "fixed":

- **Vendored unchanged** (no security-relevant behavior): `utils.ts`, `server/index.ts`
  (session codec), `server/skills.ts`, `cli/*`, `ui/index.ts`, `ui/parse-stdout.ts`.
- **Vendored with fixes**: `types.ts`, `server/parse.ts`, `server/execute.ts`,
  `server/test.ts`, `ui/build-config.ts`, `index.ts`.

### Known risks from the original audit — resolved

1. **Unconditional `--dangerously-skip-permissions`.** `compileAgyArguments` (in
   `server/execute.ts`) appended this flag on every invocation, including the `testEnvironment`
   hello probe, regardless of any configuration. Fixed: the flag is now opt-in only
   (`config.dangerouslySkipPermissions`, defaults to `false`), wired to Paperclip's standard
   `CreateConfigValues.dangerouslySkipPermissions` UI toggle in `ui/build-config.ts` — which
   upstream never read at all — and `execute()` logs an explicit warning via `onLog` whenever
   it is enabled.
2. **`sandbox` defaulting to `false`.** `execute.ts` and `server/test.ts` both used
   `asBoolean(config.sandbox, false)` — fail-open. Fixed: both now default to `true`
   (fail-safe); disabling requires an explicit `sandbox: false` in config. Note: the upstream
   *UI* mapper (`ui/build-config.ts`) already computed a safe default (`!dangerouslyBypassSandbox`),
   but the execution engine did not trust that and used its own unsafe fallback for any config
   not built through that exact UI path (API-direct hiring, programmatic config, a missing
   field). This inconsistency — not just the probe's own default — was the actual root cause.
3. **Missing/incorrect `conversation_id` capture.** Upstream's `execute()` only ever populated
   `sessionParams` when *resuming* an existing session (`sessionId` stayed `null` for any fresh
   run, even on success), so a conversation could never be resumed past its first turn. Fixed:
   added `extractAntigravitySessionId` (`server/parse.ts`) to recover a freshly-minted
   conversation id from the CLI's own stdout/stderr on a successful non-resuming run, and wired
   it into `execute()`'s session-resolution logic.
4. **Execution under the Paperclip server's own OS identity by default.** Fixed at the
   execution-engine level, not just by documentation: `execute()` now refuses to run (throws
   `AntigravitySameHostExecutionRefusedError`) unless the resolved execution target is remote
   (SSH/sandbox) or the operator has explicitly set `requireIsolatedExecutionTarget: false`
   after reviewing the risk. `server/test.ts`'s environment probe surfaces the same check as a
   diagnostic (`antigravity_execution_not_isolated_blocked` / `_allowed`) so the risk is visible
   during setup, not only as a hard failure on the first real run. This directly operationalizes
   this project's B3 isolation requirement in code, independent of how the Paperclip instance
   itself is deployed.

### Version drift found while vendoring (not a security issue, but would not have compiled)

Upstream pinned `@paperclipai/adapter-utils ^2026.525.0`; this fork targets `2026.1005.0` to
match the Paperclip instance this adapter will actually run against. Verified against the
installed package's shipped type declarations (`node_modules/@paperclipai/adapter-utils/dist/*.d.ts`)
that three things changed between those releases and fixed accordingly:
- `ServerAdapterModule` no longer has a `modelProfiles` field, and `AdapterModelProfileKey` is no
  longer exported. Upstream's `modelProfiles` export and `AntigravityModelProfileDefinition` type
  were dropped rather than shimmed — there is nothing in the current platform for them to wire
  into.
- `PaperclipSkillEntry` no longer has a `required` field; `server/skills.ts`'s desired-skill-set
  union no longer tries to read it.

`npm run typecheck`, `npm run build`, and `npm test` (69 tests, `tests/unit/` +
`tests/integration/execute.test.ts`) all pass locally against this pin — see the PR for the
exact commands and output.
