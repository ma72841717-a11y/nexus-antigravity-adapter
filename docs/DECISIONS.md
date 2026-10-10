# Decision Log

## 2026-10-10
- Repo bootstrapped (README, LICENSE, docs skeleton, CI skeleton) directly on `main` ahead of branch protection, per charter B1 ordering.
- Upstream baseline confirmed: `weslleycapelari/adapter-antigravity-local` @ `691725a674ec28b566868b39898ffa3ff0eae4f2`, MIT. Not yet vendored.
- Proposed isolation mechanism for coding workers: Paperclip `filesystemScope: "workspace"` + `networkScope: "allowlist"` (Bubblewrap-backed, confirmed available on host) rather than new dedicated Linux OS accounts, which would require host root access NEXUS does not have.
- Hiring of Claude implementer + Codex reviewer deferred pending owner confirmation and (for Codex) an OpenAI/ChatGPT connection, which is not yet installed.
