import { describe, expect, it } from "vitest";
import { compileAgyArguments } from "../../src/server/execute.js";

/**
 * Unit tests for the `agy` CLI argument builder, split out of `execute()` in this fork so
 * every safety flag's provenance (sandbox, dangerouslySkipPermissions) is independently
 * testable rather than buried inside a large execution function.
 *
 * The headline behavior change from upstream: `--dangerously-skip-permissions` must never
 * appear unless explicitly requested. Upstream appended it unconditionally to every
 * invocation, including the environment "hello" probe.
 */
describe("compileAgyArguments", () => {
  const baseOptions = { sandbox: true, dangerouslySkipPermissions: false, extraArgs: [] as string[] };

  it("never includes --dangerously-skip-permissions unless explicitly requested", () => {
    const args = compileAgyArguments("hello", null, [], baseOptions);
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("includes --dangerously-skip-permissions only when explicitly opted in", () => {
    const args = compileAgyArguments("hello", null, [], { ...baseOptions, dangerouslySkipPermissions: true });
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("includes --sandbox by default and omits it when explicitly disabled", () => {
    const sandboxed = compileAgyArguments("hello", null, [], baseOptions);
    expect(sandboxed).toContain("--sandbox");

    const unsandboxed = compileAgyArguments("hello", null, [], { ...baseOptions, sandbox: false });
    expect(unsandboxed).not.toContain("--sandbox");
  });

  it("starts with --print and the prompt payload", () => {
    const args = compileAgyArguments("my prompt", null, [], baseOptions);
    expect(args[0]).toBe("--print");
    expect(args[1]).toBe("my prompt");
  });

  it("appends --conversation when resuming a session", () => {
    const args = compileAgyArguments("hello", "session-abc", [], baseOptions);
    expect(args).toEqual(expect.arrayContaining(["--conversation", "session-abc"]));
  });

  it("omits --conversation on a fresh (non-resuming) run", () => {
    const args = compileAgyArguments("hello", null, [], baseOptions);
    expect(args).not.toContain("--conversation");
  });

  it("registers each workspace with a repeated --add-dir flag", () => {
    const args = compileAgyArguments("hello", null, [{ cwd: "/ws/one" }, { cwd: "/ws/two" }], baseOptions);
    expect(args).toEqual(expect.arrayContaining(["--add-dir", "/ws/one", "--add-dir", "/ws/two"]));
  });

  it("skips workspaces without a usable cwd", () => {
    const args = compileAgyArguments("hello", null, [{}, { cwd: "" }], baseOptions);
    expect(args).not.toContain("--add-dir");
  });

  it("resolves away `..`/`.` traversal segments in a workspace cwd before passing it to --add-dir", () => {
    const args = compileAgyArguments("hello", null, [{ cwd: "/ws/one/../two" }], baseOptions);
    expect(args).toEqual(expect.arrayContaining(["--add-dir", "/ws/two"]));
  });

  it("appends extraArgs last, after safety flags", () => {
    const args = compileAgyArguments("hello", null, [], { ...baseOptions, extraArgs: ["--foo", "--bar"] });
    expect(args.slice(-2)).toEqual(["--foo", "--bar"]);
  });

  it("composes resume, workspaces, safety flags, and extra args together in order", () => {
    const args = compileAgyArguments(
      "prompt text",
      "resume-id",
      [{ cwd: "/ws" }],
      { sandbox: true, dangerouslySkipPermissions: true, extraArgs: ["--trace"] },
    );
    expect(args).toEqual([
      "--print",
      "prompt text",
      "--conversation",
      "resume-id",
      "--add-dir",
      "/ws",
      "--sandbox",
      "--dangerously-skip-permissions",
      "--trace",
    ]);
  });
});
