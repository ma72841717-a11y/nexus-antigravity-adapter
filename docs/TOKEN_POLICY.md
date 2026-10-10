# Token / Cost Efficiency Policy

Applies to NEXUS and every hired worker on this project.

1. **Compact handoffs.** Task descriptions carry exact requirements, file paths, failing assertions, and acceptance criteria — not full-repo context. Children report SHA, test result, and next action only.
2. **Targeted retrieval.** Prefer symbol/path-scoped reads and `rg`/grep over full-file or full-repo dumps. Load skills/docs on demand, not on every turn.
3. **Minimal installed context.** Each agent gets only the skills it needs for its role (see `docs/SKILLS_MANIFEST.md`); no blanket skill installs.
4. **Bounded turns.** Runs have a turn/timeout ceiling; a stuck run escalates (alert) rather than looping.
5. **Session reuse.** Reuse an agent's existing run/workspace for related follow-up work instead of re-establishing context from scratch, where the platform supports it.
6. **Cheap-model-first, escalate when needed.** Use lighter effort for triage/status/simple edits; reserve high-effort reasoning for architecture, security-sensitive changes, and hard failures.
7. **No repeated full-repo audits.** One canonical audit per unit of work (recorded in `docs/DECISIONS.md` / `docs/CURRENT_STATE.md`); resume from that record instead of re-deriving it.
8. **No LLM polling loops.** Status/CI/alert checks use deterministic scripts or Paperclip's event-driven wakes (blockers, monitors, approvals) — never a timer loop that re-asks a model "anything new?".
9. **Quota exhaustion handling.** On provider rate-limit/quota errors, pause and resume when the provider allows it; never silently switch to paid overage. Alert via `nexus-alert quota ...` after retries are exhausted.
10. **Usage tracking.** Track token/run usage per agent/issue where the platform exposes it (Paperclip costs API); report real numbers, not estimates presented as measured.
