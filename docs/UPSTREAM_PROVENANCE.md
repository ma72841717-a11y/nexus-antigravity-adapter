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

Vendored into `src/` with per-file attribution headers, split into "unchanged", "compat-fixed",
and "security-fixed":

- **Vendored unchanged** (no security-relevant behavior, no compile-compat change needed):
  `utils.ts`, `server/index.ts` (session codec), `cli/*`, `ui/index.ts`, `ui/parse-stdout.ts`.
- **Vendored with a compile-compatibility fix** (no security-relevant behavior change, but not
  byte-for-byte identical to upstream): `server/skills.ts` — see "Version drift found while
  vendoring" below for why its desired-skill-set union no longer reads a `.required` field.
- **Vendored with security-relevant fixes**: `types.ts`, `server/parse.ts`, `server/execute.ts`,
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

_As of 2026-10-10, before PR #1 review fixes below:_ `npm run typecheck`, `npm run build`, and
`npm test` (69 tests, `tests/unit/` + `tests/integration/execute.test.ts`) all passed locally
against this pin. See "PR #1 review fixes" and "NEX-8" below for the test count after
subsequent review rounds, and `docs/CURRENT_STATE.md` for the current count.

## PR #1 review fixes (NEX-5)

An independent reviewer (`codex-rawea/adapter-tests-p0`, merged as PR #2) added
`tests/integration/independent-cli-contract.test.ts` against this fork's own `execute()`, and
a second independent review (Codex Ma72, posted as a PR #1 review comment) found four further
issues. All are fixed on `claude/adapter-implementation-p0`:

1. **Dangerous-flag probe leak.** `server/test.ts`'s hello/probe call read
   `config.dangerouslySkipPermissions` and `config.extraArgs`/`config.args` into its own argument
   list, so the opt-in-only bypass flag could reach the probe through `extraArgs` even with
   `dangerouslySkipPermissions` left at its default `false`. Fixed structurally: the probe's
   argument list is now built from a fixed literal set (`--print`, the literal probe prompt, and
   an optional `--sandbox`) that cannot be extended by any config value. See
   `tests/unit/test-environment.test.ts`.
2. **Session-id spoofing / provenance.** `extractAntigravitySessionId` (`server/parse.ts`) trusted
   any substring of combined stdout/stderr matching its key pattern, anywhere in the text —
   including inside the model's own free-form response, which can be influenced by prompt
   injection. Fixed: a match is only trusted when everything before it on its line is pure
   whitespace/JSON scaffolding (start of line, or start of a JSON object/field), rejecting matches
   embedded mid-sentence in prose. See `tests/unit/parse.test.ts`.
3. **Resume-session/workspace collision.** `execute()` only checked execution-target identity
   before resuming a stored session id, not workspace identity, so a session id could in
   principle be resumed against an unrelated workspace sharing the same execution target. Fixed:
   resume now also requires the stored and current workspace identity to match (by
   `workspaceId` when either side has one, else by the resolved execution cwd). See
   `tests/integration/execute.test.ts` ("execute() session resume workspace binding").
4. **Diagnostics leaking raw CLI output/credentials.** Failure paths built `errorMessage` (and
   `resultJson.raw`/`summary`) directly from raw CLI stdout/stderr, so a failing or misbehaving
   CLI process echoing credential material back would leak it straight through. Fixed with one
   shared sanitization path (`server/redact.ts`'s `redactSecrets`) applied to stdout/stderr before
   either is used anywhere in the returned result. The same pass also fixed a related bug: a
   signal-terminated run with no exit code (`exitCode: null`) was being treated as a *successful*
   run (`(null ?? 0) !== 0` is `false`) and silently returned `errorMessage: null`; it now reports
   `Antigravity terminated by signal <signal>`.

**Noted but not a hard blocker, fixed as a small contained change (superseded below by NEX-8):**
`--add-dir` workspace paths were passed to the CLI unresolved. `compileAgyArguments` ran each
workspace cwd through `path.resolve` to collapse `.`/`..` traversal segments before it reached
`--add-dir`. Full containment against a single configured "workspace root" is deliberately
**not** enforced — see `docs/CURRENT_STATE.md` for why.

## PR #1 release-blocker fixes (NEX-8)

A third independent review (Codex Ma72's second pass, PR #1 review comment) found four further
issues, fixed on `claude/adapter-implementation-p0`:

1. **Tarball shipped no code.** `package.json` declared `exports` entirely under `./dist/*`, but
   `dist/` is gitignored and there was no `files` allowlist, `.npmignore`, or `prepack` step —
   `npm pack`/`npm publish` produced a tarball with zero `dist/` files. Fixed: added a `files`
   allowlist (`dist`, `THIRD_PARTY_NOTICES.md`) and a `prepack` script (`clean` + `build`).
   Verified by actually importing all four declared exports (`.`, `./server`, `./ui`, `./cli`)
   from a packed tarball in a separate throwaway project, not just checking file presence.
2. **README stale/broken; doc contradictions.** The README claimed an unpushed branch and 69
   tests, linked to two docs that didn't exist (`docs/ARCHITECTURE.md`,
   `docs/OWNER_INSTALL_GUIDE.md`), had no install/config example or `agy` auth prerequisite, and
   claimed "JSON result/usage parsing" despite `execute()` always returning zeroed `usage` and
   raw stdout. `docs/CURRENT_STATE.md` had un-dated sections asserting "not pushed to GitHub" /
   "69 tests" / "no PR" alongside its own newer sections saying the opposite.
   `docs/UPSTREAM_PROVENANCE.md` called `server/skills.ts` "vendored unchanged" while describing
   (a few lines later, and in the file's own header) a changed required-skill union. Fixed:
   README rewritten with a current status line, a working install/config example, the auth
   prerequisite, and a Limitations section; `docs/ARCHITECTURE.md` and
   `docs/OWNER_INSTALL_GUIDE.md` added; `docs/CURRENT_STATE.md`'s historical sections dated
   instead of left ambiguous; `server/skills.ts` reclassified above as "compat-fixed" rather
   than "unchanged" (its own file header corrected to match).
3. **`--add-dir` path contract.** `compileAgyArguments`'s `path.resolve(wsCwd)` silently
   anchored a relative workspace cwd against *this process's own* cwd on the Paperclip host.
   Since `agy` actually runs against `effectiveExecutionCwd` on a possibly-remote
   `executionTarget`, that resolution could hand the CLI a path meaningful only on the wrong
   filesystem. Fixed: workspace cwds are now required to already be absolute
   (`AntigravityRelativeWorkspacePathError` otherwise); absolute paths are normalized in place
   via `path.normalize` instead of being re-rooted. See `tests/unit/command-args.test.ts` and
   `tests/integration/execute.test.ts` ("execute() --add-dir path contract against a remote
   execution target") for coverage including a relative cwd against a remote target.
4. **Merged Codex Rawea's two additional test-only commits** (`72491a0`, `f2d7c69`, test files
   only) from `codex-rawea/adapter-tests-p0` on top of the already-merged `688bc82`. One test
   ("keeps overlapping calls and their process handles separate") needed its shared-session
   fixture updated to carry a `cwd` matching the resolved execution cwd, since it predated the
   workspace-identity binding guard from NEX-5 finding 3 above and would otherwise be correctly
   refused a resume by that guard.
