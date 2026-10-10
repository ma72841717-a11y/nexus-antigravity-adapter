# Sandbox Isolation Pre-Flight Test — Result: FAILED (hard blocker)

**Date:** 2026-10-10
**Scope:** Verify Paperclip's Bubblewrap-based worker confinement (`filesystemScope=workspace`, `networkScope=allowlist` on the `claude_local`/`codex_local` adapters) actually isolates a coding worker, per the owner's mandatory pre-launch condition recorded on NEX-3.

## Result

The sandbox mechanism **does not start** on this host. No negative-test probes (file access, env leakage, network escape, subprocess escape) were reached, because Bubblewrap itself fails before the worker process executes.

## Evidence

### 1. Real worker run (CLAUDE-DEV, `filesystemScope=workspace` + `networkScope=allowlist`)

Hired agent `CLAUDE-DEV` via the Paperclip `agent-hires` API with the owner-approved sandbox settings and assigned it a pre-flight test issue (NEX-7). The run failed immediately:

```
errorReason: "Claude exited with code 1: bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted"
```

The agent's status moved to `error`. **No code executed** — this is a fail-closed failure (the wrapper aborts the whole process before the Claude CLI starts), not a silent fallback to unconfined execution.

### 2. Independent reproduction (direct Bubblewrap probes from NEXUS's own shell, same host)

```
$ bwrap --unshare-net --dev-bind / / -- echo "netns-only ok"
bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted

$ bwrap --dev-bind / / -- echo "fs-only-bwrap ok"
bwrap: setting up uid map: Permission denied
```

Two independent, unrelated failures:

- **Network confinement** (`networkScope`) fails because Bubblewrap cannot configure the loopback interface inside a new network namespace — the outer container lacks the capability to do this (commonly `CAP_NET_ADMIN`, or the namespace nesting is disallowed).
- **Filesystem-only confinement** (`filesystemScope`, no network unshare) fails separately with `setting up uid map: Permission denied` — this means **unprivileged Linux user-namespace creation itself is blocked** in this container, which is the foundation Bubblewrap needs for any confinement, not just the network piece.

## Conclusion

Per the owner's explicit condition on NEX-3 ("If any mandatory isolation test fails, DO NOT launch unattended coding workers"): **no autonomous/unattended coding execution is authorized until this is resolved.** CLAUDE-DEV remains hired (identity + config only) but has not been assigned any build work. NEX-4 (build) and NEX-5/6 (review/release) remain blocked on this.

## Proposed paths forward (owner decision required)

1. Grant this host/container the kernel capabilities Bubblewrap needs (allow unprivileged user-namespace creation, plus `NET_ADMIN`/equivalent for netns loopback setup), then re-run this exact pre-flight test.
2. Provision dedicated Linux OS accounts per worker (classic UID separation, no user-namespace nesting required) as a replacement isolation mechanism — requires root/owner action; NEXUS will draft the exact account/permission spec for review before anything runs under it.
3. Move coding-worker execution to an environment that already supports container/namespace nesting (e.g., a dedicated CI runner or VM), rather than this host.
4. Explicitly waive the sandbox condition for a tightly-scoped pilot (not recommended; contradicts the owner's own mandatory requirement).

NEXUS will not pick an option unilaterally — this trades off host security changes the owner reserved for themselves. See NEX-3 for the decision request.
