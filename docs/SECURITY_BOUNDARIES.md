# Security Boundaries

## Permission boundary

This project's authority is limited to the `ma72841717-a11y/nexus-antigravity-adapter` repository and its lifecycle (branches, PRs, CI, releases). It does **not** have authority to:

- Install, enable, reload, or test the adapter inside any live/active Paperclip instance.
- Access or modify ERP (staging or production), TITAN, the AGY VPS, the CODEX VPS, or the Global AI Factory, or their GitHub repositories (e.g. `coolboy1581/erp-compliance-platform` is a distinct, out-of-scope identity/repo).
- Change host-level security, sudoers, system services, firewall rules, or Paperclip's own adapter registry.
- Spend money, purchase metered APIs, or enable paid API overage without explicit owner approval.
- Read or export Paperclip's secret master key, other agents' credentials, or `nexus-agy`'s authenticated session/auth files.

## Execution isolation (workers)

Coding workers (Claude implementer, Codex reviewer) run as **Paperclip-managed `claude_local` / `codex_local` agents**, not as the `paperclip` OS user:

- `engine: "cli"` with `filesystemScope: "workspace"` — Bubblewrap-confines the worker process to its own execution workspace; other host paths (including the `paperclip` user's home, Paperclip's secret store, and `nexus-agy`'s home) are hidden, not merely unconfigured.
- `networkScope: "allowlist"` with an explicit `networkAllowlist` (e.g. `api.anthropic.com`, `api.openai.com`, `github.com`, `api.github.com`) — blocks all other egress through Paperclip's HTTP(S) proxy.
- No shared credentials: `codex_local` agents get an explicit empty `OPENAI_API_KEY` override by default; neither worker is configured with Paperclip's API key/broker token in its environment.
- This is a materially different control than "different `cwd`/`HOME`" — confirmed available on this host (`bwrap` 0.9.0 present).
- A separate dedicated non-sudo Linux OS account per worker (stronger separation again) is **not** created by this project: creating new OS accounts needs host-level root action, which NEXUS does not have and will not take without explicit owner authorization. See the open decision in the linked Paperclip issue NEX-3.

## Secrets

- No credential is ever pasted into commits, issues, comments, or logs.
- GitHub access uses Paperclip's managed GitHub connection; scope should be limited to this repository (verify in GitHub App installation settings).
- AI provider access uses Paperclip's subscription-mode connections (Anthropic: connected; OpenAI: pending owner connection), not raw API keys injected into worker environments.
