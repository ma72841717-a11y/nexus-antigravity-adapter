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

Directory listing, `LICENSE`, and `package.json` reviewed read-only prior to any import. Not yet vendored into this repository.

**Before vendoring (tracked task, implementation agent):**
- Review full `src/` and `tests/` contents, `.github/` workflows, and `SETUP.md` for behavior, not just structure.
- Confirm no npm lifecycle scripts (`preinstall`/`postinstall`/etc.) execute arbitrary code; none declared in the `scripts` block above, but transitive deps must still be checked.
- Preserve the exact upstream `LICENSE` text and copyright notice alongside this repo's own `LICENSE` (e.g. in `docs/UPSTREAM_PROVENANCE.md` or a `THIRD_PARTY_NOTICES` file) per MIT attribution requirements.
- Re-pin the SHA actually imported if it differs from the one observed here, and note the diff.
- Known risks to fix from evidence (per charter): unconditional `--dangerously-skip-permissions`, `sandbox=false` default, missing/incorrect `conversation_id` capture, execution under the Paperclip server's OS identity by default.
