import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration-style tests for `execute()` against a fully mocked `@paperclipai/adapter-utils`
 * runtime and a mocked `agy` CLI process (via `runAdapterExecutionTargetProcess`). No real
 * CLI, network call, or credential is ever touched — this validates the adapter's own
 * decision logic (same-host refusal, safety-flag wiring, new-session-id capture) against
 * a scripted fake process, per the project charter's "mocked CLI process, no live service"
 * requirement.
 */

const runAdapterExecutionTargetProcess = vi.fn();
const ensureAdapterExecutionTargetCommandResolvable = vi.fn(async () => {});
const resolveAdapterExecutionTargetCommandForLogs = vi.fn(async (command: string) => command);
const prepareAdapterExecutionTargetRuntime = vi.fn(async () => ({
  restoreWorkspace: async () => {},
  workspaceRemoteDir: "/remote/workspace",
  runtimeRootDir: "/remote/root",
}));
const startAdapterExecutionTargetPaperclipBridge = vi.fn(async () => null);

vi.mock("@paperclipai/adapter-utils/execution-target", () => ({
  adapterExecutionTargetIsRemote: (target: { kind?: string } | null | undefined) => target?.kind === "remote",
  adapterExecutionTargetRemoteCwd: (_target: unknown, localCwd: string) => localCwd,
  overrideAdapterExecutionTargetRemoteCwd: (target: unknown) => target,
  adapterExecutionTargetSessionIdentity: (target: { kind?: string } | null | undefined) => ({ kind: target?.kind ?? null }),
  adapterExecutionTargetSessionMatches: () => true,
  adapterExecutionTargetUsesPaperclipBridge: () => false,
  describeAdapterExecutionTarget: () => "mock-target",
  ensureAdapterExecutionTargetCommandResolvable,
  prepareAdapterExecutionTargetRuntime,
  readAdapterExecutionTarget: (input: { executionTarget?: unknown }) => input.executionTarget ?? null,
  resolveAdapterExecutionTargetTimeoutSec: (_target: unknown, configured: number) => configured,
  resolveAdapterExecutionTargetCommandForLogs,
  runAdapterExecutionTargetProcess,
  startAdapterExecutionTargetPaperclipBridge,
}));

vi.mock("@paperclipai/adapter-utils/server-utils", () => ({
  asBoolean: (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback),
  asNumber: (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback),
  asString: (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback),
  asStringArray: (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []),
  buildPaperclipEnv: (agent: { id: string }) => ({ PAPERCLIP_AGENT_ID: agent.id }),
  buildInvocationEnvForLogs: (env: Record<string, string>) => ({ ...env }),
  ensureAbsoluteDirectory: async () => {},
  joinPromptSections: (sections: Array<string | null | undefined>) => sections.filter(Boolean).join("\n\n"),
  ensurePathInEnv: (env: NodeJS.ProcessEnv) => env,
  refreshPaperclipWorkspaceEnvForExecution: () => {},
  parseObject: (value: unknown) => (typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}),
  renderTemplate: (template: string) => template,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE: "default-template",
}));

const { execute, AntigravitySameHostExecutionRefusedError, AntigravityRelativeWorkspacePathError } = await import(
  "../../src/server/execute.js"
);

function buildCtx(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-1",
    agent: { id: "agent-1", companyId: "company-1" },
    runtime: { sessionId: null, sessionParams: null },
    config: {},
    context: { paperclipWorkspace: {}, paperclipWorkspaces: [] },
    onLog: vi.fn(async () => {}),
    onMeta: vi.fn(async () => {}),
    onSpawn: vi.fn(),
    authToken: null,
    executionTarget: { kind: "remote" },
    ...overrides,
  } as any;
}

beforeEach(() => {
  runAdapterExecutionTargetProcess.mockReset();
});

describe("execute() same-host isolation guard", () => {
  it("refuses to run when no execution target is configured (same host as Paperclip)", async () => {
    const ctx = buildCtx({ executionTarget: null });
    await expect(execute(ctx)).rejects.toThrow(AntigravitySameHostExecutionRefusedError);
    expect(runAdapterExecutionTargetProcess).not.toHaveBeenCalled();
  });

  it("refuses to run on an explicit local-kind target", async () => {
    const ctx = buildCtx({ executionTarget: { kind: "local" } });
    await expect(execute(ctx)).rejects.toThrow(AntigravitySameHostExecutionRefusedError);
  });

  it("allows same-host execution only when requireIsolatedExecutionTarget is explicitly disabled", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "hi",
      stderr: "",
      pid: 123,
      startedAt: null,
    });
    const ctx = buildCtx({ executionTarget: null, config: { requireIsolatedExecutionTarget: false } });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(runAdapterExecutionTargetProcess).toHaveBeenCalledTimes(1);
  });

  it("runs normally on an isolated remote target without needing any opt-out", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "hi",
      stderr: "",
      pid: 123,
      startedAt: null,
    });
    const ctx = buildCtx();
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
  });
});

describe("execute() session/conversation id capture", () => {
  it("captures a freshly-minted session id reported by the mocked CLI on a new run", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "Conversation ID: fresh-conv-001\nDone.",
      stderr: "",
      pid: 123,
      startedAt: null,
    });
    const ctx = buildCtx();
    const result = await execute(ctx);

    expect(result.sessionId).toBe("fresh-conv-001");
    expect(result.sessionParams).toMatchObject({ sessionId: "fresh-conv-001" });
  });

  it("does not fabricate a session id when the fresh run reports none", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "No session reported here.",
      stderr: "",
      pid: 123,
      startedAt: null,
    });
    const ctx = buildCtx();
    const result = await execute(ctx);

    expect(result.sessionId).toBeNull();
    expect(result.sessionParams).toBeNull();
  });

  it("does not attempt to mint a new session id when a run failed", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 1,
      signal: null,
      timedOut: false,
      stdout: "",
      stderr: "error: boom\nConversation ID: should-be-ignored",
      pid: 123,
      startedAt: null,
    });
    const ctx = buildCtx();
    const result = await execute(ctx);

    expect(result.sessionId).toBeNull();
    expect(result.errorMessage).toContain("boom");
  });

  it("prefers resuming the existing session over anything reported fresh", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "Conversation ID: ignored-because-resuming\nDone.",
      stderr: "",
      pid: 123,
      startedAt: null,
    });
    const ctx = buildCtx({
      runtime: { sessionId: "existing-session", sessionParams: { sessionId: "existing-session", cwd: "/remote/workspace" } },
    });
    const result = await execute(ctx);

    expect(result.sessionId).toBe("existing-session");
    const [, , , args] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["--conversation", "existing-session"]));
  });
});

describe("execute() session resume workspace binding", () => {
  // New in this fork: a stored session id is only resumable within the workspace it was
  // minted in. Without this, a session id that happened to match on execution-target
  // identity alone could be resumed against a completely unrelated workspace.
  beforeEach(() => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "ok",
      stderr: "",
      pid: 1,
      startedAt: null,
    });
  });

  it("refuses to resume a session minted for a different Paperclip workspaceId", async () => {
    const ctx = buildCtx({
      context: { paperclipWorkspace: { workspaceId: "ws-current" }, paperclipWorkspaces: [] },
      runtime: {
        sessionId: "session-from-other-workspace",
        sessionParams: { sessionId: "session-from-other-workspace", workspaceId: "ws-other" },
      },
    });
    await execute(ctx);
    const [, , , args] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(args).not.toContain("--conversation");
  });

  it("resumes a session whose stored workspaceId matches the current one", async () => {
    const ctx = buildCtx({
      context: { paperclipWorkspace: { workspaceId: "ws-current" }, paperclipWorkspaces: [] },
      runtime: {
        sessionId: "session-same-workspace",
        sessionParams: { sessionId: "session-same-workspace", workspaceId: "ws-current" },
      },
    });
    await execute(ctx);
    const [, , , args] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["--conversation", "session-same-workspace"]));
  });

  it("refuses to resume a session minted under a different cwd when neither side has a workspaceId", async () => {
    const ctx = buildCtx({
      runtime: {
        sessionId: "session-from-other-cwd",
        sessionParams: { sessionId: "session-from-other-cwd", cwd: "/remote/some-other-workspace" },
      },
    });
    await execute(ctx);
    const [, , , args] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(args).not.toContain("--conversation");
  });
});

describe("execute() safety flag wiring end-to-end", () => {
  it("never passes --dangerously-skip-permissions to the mocked CLI by default", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "ok",
      stderr: "",
      pid: 1,
      startedAt: null,
    });
    const ctx = buildCtx();
    await execute(ctx);

    const [, , , args] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("passes --dangerously-skip-permissions only when explicitly configured, and warns via onLog", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "ok",
      stderr: "",
      pid: 1,
      startedAt: null,
    });
    const ctx = buildCtx({ config: { dangerouslySkipPermissions: true } });
    await execute(ctx);

    const [, , , args] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(args).toContain("--dangerously-skip-permissions");
    expect(ctx.onLog).toHaveBeenCalledWith("stdout", expect.stringContaining("dangerouslySkipPermissions is enabled"));
  });

  it("passes --sandbox by default and omits it when explicitly disabled", async () => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "ok",
      stderr: "",
      pid: 1,
      startedAt: null,
    });

    const defaultCtx = buildCtx();
    await execute(defaultCtx);
    const [, , , defaultArgs] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(defaultArgs).toContain("--sandbox");

    runAdapterExecutionTargetProcess.mockClear();
    const disabledCtx = buildCtx({ config: { sandbox: false } });
    await execute(disabledCtx);
    const [, , , disabledArgs] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(disabledArgs).not.toContain("--sandbox");
  });
});

describe("execute() --add-dir path contract against a remote execution target", () => {
  // `agy` runs against `effectiveExecutionCwd` on a possibly-remote `executionTarget`
  // (buildCtx() defaults to { kind: "remote" }), not against this test process's own cwd.
  // A relative workspace cwd can only be resolved correctly by whoever knows that remote
  // filesystem's coordinate system — resolving it here against this process's cwd would
  // silently produce a path meaningful only on the wrong (local) filesystem.
  beforeEach(() => {
    runAdapterExecutionTargetProcess.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "ok",
      stderr: "",
      pid: 1,
      startedAt: null,
    });
  });

  it("refuses a relative workspace cwd rather than silently resolving it against the host's own cwd", async () => {
    const ctx = buildCtx({
      context: { paperclipWorkspace: {}, paperclipWorkspaces: [{ cwd: "relative/workspace" }] },
    });
    await expect(execute(ctx)).rejects.toThrow(AntigravityRelativeWorkspacePathError);
    expect(runAdapterExecutionTargetProcess).not.toHaveBeenCalled();
  });

  it("passes an absolute workspace cwd through to --add-dir unchanged (normalized, not re-rooted)", async () => {
    const ctx = buildCtx({
      context: { paperclipWorkspace: {}, paperclipWorkspaces: [{ cwd: "/remote/workspace/./nested" }] },
    });
    await execute(ctx);
    const [, , , args] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["--add-dir", "/remote/workspace/nested"]));
  });
});
