import { beforeEach, describe, expect, it, vi } from "vitest";

// This suite owns its process boundary. No agy executable, network service, or real
// credential is used; the fake returns the same shape as the execution-target runner.
const fake = vi.hoisted(() => ({
  process: vi.fn(),
  restore: vi.fn(async () => {}),
  prepare: vi.fn(async () => ({
    restoreWorkspace: fake.restore,
    workspaceRemoteDir: "/remote/project",
    runtimeRootDir: "/remote/runtime",
  })),
}));

vi.mock("@paperclipai/adapter-utils/execution-target", () => ({
  readAdapterExecutionTarget: ({ executionTarget }: { executionTarget?: unknown }) => executionTarget ?? null,
  adapterExecutionTargetIsRemote: (target: { kind?: string } | null) => target?.kind === "remote",
  adapterExecutionTargetRemoteCwd: (_target: unknown, cwd: string) => cwd,
  overrideAdapterExecutionTargetRemoteCwd: (target: unknown) => target,
  adapterExecutionTargetSessionIdentity: (target: { kind?: string; remoteWorkspacePath?: string; targetId?: string }) => ({
    kind: target.kind, remoteWorkspacePath: target.remoteWorkspacePath, targetId: target.targetId,
  }),
  adapterExecutionTargetSessionMatches: (saved: { kind?: string; remoteWorkspacePath?: string; targetId?: string }, target: { kind?: string; remoteWorkspacePath?: string; targetId?: string }) =>
    saved.kind === target.kind && saved.remoteWorkspacePath === target.remoteWorkspacePath && saved.targetId === target.targetId,
  adapterExecutionTargetUsesPaperclipBridge: () => false,
  describeAdapterExecutionTarget: () => "isolated test target",
  ensureAdapterExecutionTargetCommandResolvable: async () => {},
  prepareAdapterExecutionTargetRuntime: fake.prepare,
  resolveAdapterExecutionTargetTimeoutSec: (_target: unknown, timeout: number) => timeout,
  resolveAdapterExecutionTargetCommandForLogs: async (command: string) => command,
  runAdapterExecutionTargetProcess: fake.process,
  startAdapterExecutionTargetPaperclipBridge: async () => null,
}));

vi.mock("@paperclipai/adapter-utils/server-utils", () => ({
  asBoolean: (v: unknown, d: boolean) => typeof v === "boolean" ? v : d,
  asNumber: (v: unknown, d: number) => typeof v === "number" ? v : d,
  asString: (v: unknown, d: string) => typeof v === "string" ? v : d,
  asStringArray: (v: unknown) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [],
  buildPaperclipEnv: () => ({}),
  buildInvocationEnvForLogs: () => ({}),
  ensureAbsoluteDirectory: async () => {},
  joinPromptSections: (parts: string[]) => parts.join("\n\n"),
  ensurePathInEnv: (env: Record<string, string>) => env,
  refreshPaperclipWorkspaceEnvForExecution: () => {},
  parseObject: (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v : {},
  renderTemplate: (template: string) => template,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE: "independent test prompt",
}));

const { execute, AntigravitySameHostExecutionRefusedError } = await import("../../src/server/execute.js");

function result(overrides: Record<string, unknown> = {}) {
  return { exitCode: 0, signal: null, timedOut: false, stdout: "answer", stderr: "", ...overrides };
}

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    runId: "test-run",
    agent: { id: "test-agent", companyId: "test-company" },
    runtime: { sessionId: null, sessionParams: null },
    config: {},
    context: { paperclipWorkspace: {}, paperclipWorkspaces: [] },
    executionTarget: { kind: "remote" },
    onLog: vi.fn(async () => {}),
    onMeta: vi.fn(async () => {}),
    onSpawn: vi.fn(),
    authToken: null,
    ...overrides,
  } as any;
}

function invocation() {
  expect(fake.process).toHaveBeenCalledTimes(1);
  const [, , command, args, options] = fake.process.mock.calls[0];
  return { command, args: args as string[], options };
}

beforeEach(() => {
  fake.process.mockReset().mockResolvedValue(result());
  fake.prepare.mockClear();
  fake.restore.mockClear();
});

describe("independent agy process contract", () => {
  it("passes every supported argument as an argv element, preserving long prompts and special paths", async () => {
    const prompt = "quoted 'text' \"double\" $HOME; $(echo no)\n" + "x".repeat(100_000);
    const specialPath = "/work/a b/it's;$(touch never)";
    const input = ctx({
      config: { promptTemplate: prompt, extraArgs: ["--format", "json value", "--custom=é"] },
      context: { paperclipWorkspace: {}, paperclipWorkspaces: [{ cwd: specialPath }, { cwd: "" }, {}, { cwd: "/work/two" }] },
    });
    await execute(input);
    const { command, args } = invocation();
    expect(command).toBe("agy");
    expect(args).toEqual(["--print", prompt, "--add-dir", specialPath, "--add-dir", "/work/two", "--sandbox", "--format", "json value", "--custom=é"]);
  });

  it("keeps empty workspaces empty and uses legacy args only when extraArgs is absent", async () => {
    await execute(ctx({ config: { args: ["--legacy", "value with spaces"] } }));
    expect(invocation().args).toEqual(["--print", "independent test prompt", "--sandbox", "--legacy", "value with spaces"]);
  });

  it("defaults to sandbox and requires a literal opt-in for permission bypass", async () => {
    await execute(ctx({ config: { dangerouslySkipPermissions: "true", sandbox: "false" } }));
    expect(invocation().args).toEqual(["--print", "independent test prompt", "--sandbox"]);
  });

  it("emits both safety overrides only when explicitly configured and warns", async () => {
    const input = ctx({ config: { sandbox: false, dangerouslySkipPermissions: true } });
    await execute(input);
    expect(invocation().args).toEqual(["--print", "independent test prompt", "--dangerously-skip-permissions"]);
    expect(input.onLog).toHaveBeenCalledWith("stdout", expect.stringContaining("WARNING"));
  });

  it("captures a fresh CLI conversation ID and uses its session params on the next turn", async () => {
    fake.process.mockResolvedValueOnce(result({ stdout: '{"conversationId":"fresh-007","text":"hello"}' }));
    const first = await execute(ctx());
    expect(first.sessionId).toBe("fresh-007");
    expect(first.sessionParams).toMatchObject({ sessionId: "fresh-007", remoteExecution: { kind: "remote" } });
    fake.process.mockClear();
    const second = await execute(ctx({ runtime: { sessionId: first.sessionId, sessionParams: first.sessionParams } }));
    expect(invocation().args).toEqual(["--print", "independent test prompt", "--conversation", "fresh-007", "--sandbox"]);
    expect(second.sessionId).toBe("fresh-007");
  });

  it("starts fresh when a stored session belongs to a different execution target", async () => {
    await execute(ctx({ runtime: { sessionId: "old-123", sessionParams: { sessionId: "old-123", remoteExecution: { kind: "other" } } } }));
    expect(invocation().args).not.toContain("--conversation");
  });

  it.each([
    ["workspace path", { kind: "remote", remoteWorkspacePath: "/remote/workspace-b", targetId: "target-a" }],
    ["execution target", { kind: "remote", remoteWorkspacePath: "/remote/workspace-a", targetId: "target-b" }],
  ])("does not resume a session captured under a different %s", async (_label, executionTarget) => {
    const saved = { sessionId: "session-from-a", remoteExecution: { kind: "remote", remoteWorkspacePath: "/remote/workspace-a", targetId: "target-a" } };
    const actual = await execute(ctx({ runtime: { sessionId: saved.sessionId, sessionParams: saved }, executionTarget }));
    expect(invocation().args).not.toContain("--conversation");
    expect(actual.sessionId).toBeNull();
  });

  it("passes shell metacharacters from workspace, extra args, and environment as inert values", async () => {
    const payload = "; | & $(echo never) `echo never`";
    await execute(ctx({
      runId: payload,
      config: { cwd: `/work/${payload}`, extraArgs: ["--literal", payload] },
      context: { paperclipWorkspace: { cwd: `/work/${payload}` }, paperclipWorkspaces: [{ cwd: `/other/${payload}` }] },
    }));
    const { command, args, options } = invocation();
    expect(command).toBe("agy");
    expect(args).toEqual(["--print", "independent test prompt", "--add-dir", `/other/${payload}`, "--sandbox", "--literal", payload]);
    expect(options.cwd).toBe(`/work/${payload}`);
    expect(options.env.PAPERCLIP_RUN_ID).toBe(payload);
  });

  it("keeps overlapping calls and their process handles separate", async () => {
    const pending: Array<(value: ReturnType<typeof result>) => void> = [];
    fake.process.mockImplementation((_runId, _target, _command, _args, options) => {
      options.onSpawn?.({ pid: pending.length + 1 });
      return new Promise((resolve) => pending.push(resolve));
    });
    const first = ctx({ runId: "run-a", config: { promptTemplate: "prompt-a" } });
    const second = ctx({ runId: "run-b", config: { promptTemplate: "prompt-b" } });
    const firstRun = execute(first);
    const secondRun = execute(second);
    await vi.waitFor(() => expect(fake.process).toHaveBeenCalledTimes(2));
    expect(fake.process.mock.calls.map((call) => [call[0], call[3][1]])).toEqual([["run-a", "prompt-a"], ["run-b", "prompt-b"]]);
    expect(first.onSpawn).toHaveBeenCalledWith({ pid: 1 });
    expect(second.onSpawn).toHaveBeenCalledWith({ pid: 2 });
    pending[1](result({ stdout: '{"conversationId":"session-b"}' }));
    pending[0](result({ stdout: '{"conversationId":"session-a"}' }));
    expect((await firstRun).sessionId).toBe("session-a");
    expect((await secondRun).sessionId).toBe("session-b");
    expect(fake.restore).toHaveBeenCalledTimes(2);
  });

  it("restores the prepared workspace when a mocked mid-flight cancellation rejects", async () => {
    let rejectProcess!: (reason: Error) => void;
    fake.process.mockImplementation(() => new Promise((_resolve, reject) => { rejectProcess = reject; }));
    const input = ctx();
    const running = execute(input);
    await vi.waitFor(() => expect(fake.process).toHaveBeenCalledTimes(1));
    const cancelled = new Error("cancelled after spawn");
    cancelled.name = "AbortError";
    rejectProcess(cancelled);
    await expect(running).rejects.toBe(cancelled);
    expect(fake.restore).toHaveBeenCalledTimes(1);
    expect(fake.process.mock.calls[0][4].onSpawn).toBe(input.onSpawn);
  });

  it.each([
    ["valid JSON", '{"conversationId":"valid-009","answer":"ok"}', "valid-009"],
    ["truncated JSON", '{"conversationId":"partial-009",', "partial-009"],
    ["malformed JSON", '{not json}', null],
    ["empty output", "", null],
    ["unexpected schema", '{"items":[1],"sessionId":42}', null],
  ])("handles %s stdout without crashing", async (_label, stdout, expectedSession) => {
    fake.process.mockResolvedValue(result({ stdout }));
    const actual = await execute(ctx());
    expect(actual.summary).toBe(stdout);
    expect(actual.resultJson).toEqual({ raw: stdout });
    expect(actual.sessionId).toBe(expectedSession);
  });

  it("passes configured timeout and grace period, then reports a timed-out process", async () => {
    fake.process.mockResolvedValue(result({ exitCode: null, signal: "SIGTERM", timedOut: true, stdout: "" }));
    const actual = await execute(ctx({ config: { timeoutSec: 17, graceSec: 3 } }));
    expect(invocation().options).toMatchObject({ timeoutSec: 17, graceSec: 3 });
    expect(actual).toMatchObject({ timedOut: true, signal: "SIGTERM", errorMessage: "Timed out after 17s" });
  });

  it("forwards the cancellation handle to the process runner and propagates cancellation", async () => {
    const input = ctx();
    const cancelled = new Error("mock cancellation");
    cancelled.name = "AbortError";
    fake.process.mockRejectedValue(cancelled);
    await expect(execute(input)).rejects.toBe(cancelled);
    expect(invocation().options.onSpawn).toBe(input.onSpawn);
  });

  it("reports nonzero exit and stderr-only failures using the first error line", async () => {
    fake.process.mockResolvedValue(result({ exitCode: 23, stdout: "", stderr: "\n  first failure\nsecond failure" }));
    const actual = await execute(ctx());
    expect(actual.exitCode).toBe(23);
    expect(actual.errorMessage).toBe("first failure");
    expect(actual.summary).toBe("");
  });

  it("propagates process launch errors without starting a real subprocess", async () => {
    fake.process.mockRejectedValue(new Error("mock launch failure"));
    await expect(execute(ctx())).rejects.toThrow("mock launch failure");
  });

  it("refuses same-host execution before command resolution or process invocation", async () => {
    await expect(execute(ctx({ executionTarget: null }))).rejects.toThrow(AntigravitySameHostExecutionRefusedError);
    expect(fake.prepare).not.toHaveBeenCalled();
    expect(fake.process).not.toHaveBeenCalled();
  });

  it("does not expose injected credentials through metadata or errors on a normal run", async () => {
    const secret = "test-only-secret-do-not-log-123";
    const input = ctx({ authToken: secret });
    const actual = await execute(input);
    expect(JSON.stringify(input.onMeta.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(input.onLog.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(actual)).not.toContain(secret);
  });

  it("treats signal termination without an exit code as a failed run", async () => {
    fake.process.mockResolvedValue(result({ exitCode: null, signal: "SIGKILL", stdout: "", stderr: "" }));
    const actual = await execute(ctx());
    expect(actual.signal).toBe("SIGKILL");
    expect(actual.errorMessage).toBeTruthy();
  });

  it("redacts credential material echoed by a failed CLI from returned errors", async () => {
    const secret = "test-only-secret-leak-probe-456";
    fake.process.mockResolvedValue(result({ exitCode: 1, stdout: "", stderr: `failed with token ${secret}` }));
    const input = ctx({ authToken: secret });
    const actual = await execute(input);
    expect(JSON.stringify(actual)).not.toContain(secret);
    expect(JSON.stringify(input.onLog.mock.calls)).not.toContain(secret);
  });
});
