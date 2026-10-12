import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the hello-probe dangerous-flag leak fixed in this fork: the probe
 * invocation must be built from a fixed arg list that cannot be extended by caller config, so
 * neither `dangerouslySkipPermissions` nor `extraArgs`/`args` can ever reach it (see
 * src/server/test.ts and the PR #1 security review).
 */

const runAdapterExecutionTargetProcess = vi.fn();

vi.mock("@paperclipai/adapter-utils/execution-target", () => ({
  adapterExecutionTargetIsRemote: (target: { kind?: string } | null) => target?.kind === "remote",
  ensureAdapterExecutionTargetCommandResolvable: vi.fn(async () => {}),
  maybeRunSandboxInstallCommand: vi.fn(async () => null),
  ensureAdapterExecutionTargetDirectory: vi.fn(async () => {}),
  runAdapterExecutionTargetProcess,
  describeAdapterExecutionTarget: () => "mock-target",
  resolveAdapterExecutionTargetCwd: (_target: unknown, configuredCwd: string, fallback: string) => configuredCwd || fallback,
}));

vi.mock("@paperclipai/adapter-utils/server-utils", () => ({
  asBoolean: (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback),
  asNumber: (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback),
  asString: (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback),
  asStringArray: (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === "string") : []),
  ensurePathInEnv: (env: NodeJS.ProcessEnv) => env,
  parseObject: (value: unknown) => (typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}),
}));

const { testEnvironment } = await import("../../src/server/test.js");

function buildTestCtx(config: Record<string, unknown>) {
  return {
    adapterType: "antigravity_local",
    config,
    executionTarget: null,
    environmentName: null,
  } as any;
}

beforeEach(() => {
  runAdapterExecutionTargetProcess.mockReset().mockResolvedValue({
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: "hello",
    stderr: "",
    pid: 1,
    startedAt: null,
  });
});

describe("testEnvironment() hello probe argument safety", () => {
  it("never passes --dangerously-skip-permissions to the probe, even when explicitly configured", async () => {
    await testEnvironment(
      buildTestCtx({ requireIsolatedExecutionTarget: false, dangerouslySkipPermissions: true }),
    );

    expect(runAdapterExecutionTargetProcess).toHaveBeenCalledTimes(1);
    const [, , , probeArgs] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(probeArgs).not.toContain("--dangerously-skip-permissions");
  });

  it("never forwards configured extraArgs/args to the probe, closing the smuggling path structurally", async () => {
    await testEnvironment(
      buildTestCtx({
        requireIsolatedExecutionTarget: false,
        extraArgs: ["--dangerously-skip-permissions", "--whatever"],
      }),
    );

    const [, , , probeArgsFromExtraArgs] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(probeArgsFromExtraArgs).toEqual(["--print", "Respond with hello.", "--sandbox"]);

    runAdapterExecutionTargetProcess.mockClear();
    await testEnvironment(
      buildTestCtx({ requireIsolatedExecutionTarget: false, args: ["--dangerously-skip-permissions"] }),
    );
    const [, , , probeArgsFromArgs] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(probeArgsFromArgs).toEqual(["--print", "Respond with hello.", "--sandbox"]);
  });

  it("builds the probe call from --print, the fixed prompt, and an optional --sandbox only", async () => {
    await testEnvironment(buildTestCtx({ requireIsolatedExecutionTarget: false, sandbox: false }));
    const [, , , probeArgs] = runAdapterExecutionTargetProcess.mock.calls[0];
    expect(probeArgs).toEqual(["--print", "Respond with hello."]);
  });
});
