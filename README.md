# NEXUS Antigravity Adapter

Autonomous, independently-reviewed Paperclip external adapter for Google's Antigravity CLI (`agy`). Baseline forked from the upstream MIT-licensed [`adapter-antigravity-local`](https://github.com/weslleycapelari/adapter-antigravity-local) project, to be hardened for headless execution, structured session capture, and workspace isolation.

**Status:** P0 implementation on `claude/adapter-implementation-p0` — typechecked, built, and
tested locally (69 tests), not yet pushed or merged. See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).

This repository is developed and reviewed by the NEXUS AI team (NEXUS director, Claude implementation agent, Codex independent reviewer) under an owner-approved project charter. The resulting adapter is **not installed or enabled in any live Paperclip instance** by this project. Final installation is an owner/ARGUS decision made after release-candidate review — see [`docs/OWNER_INSTALL_GUIDE.md`](docs/OWNER_INSTALL_GUIDE.md) (added at release).

## Scope

- A Paperclip `createServerAdapter`-compatible adapter targeting `agy` 1.3.3.
- Headless execution, JSON result/usage parsing, session resume, workspace boundaries.
- See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/SECURITY_BOUNDARIES.md`](docs/SECURITY_BOUNDARIES.md), [`docs/UPSTREAM_PROVENANCE.md`](docs/UPSTREAM_PROVENANCE.md).

## Contributing

All changes land via pull request against `main`, gated on CI and independent review. See `.github/workflows/ci.yml`.

## License

MIT — see [`LICENSE`](LICENSE). Portions derived from the upstream project retain their original copyright notice; see [`docs/UPSTREAM_PROVENANCE.md`](docs/UPSTREAM_PROVENANCE.md).
