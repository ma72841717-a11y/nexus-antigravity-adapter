/**
 * @fileoverview Core execution engine for the Antigravity (`agy`) local CLI adapter.
 *
 * Forked from `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2` (MIT License). See docs/UPSTREAM_PROVENANCE.md
 * and THIRD_PARTY_NOTICES.md for full attribution.
 *
 * Security-relevant fixes applied in this fork (see docs/UPSTREAM_PROVENANCE.md "Known risks"):
 *
 *  1. `--dangerously-skip-permissions` is no longer appended unconditionally to every
 *     invocation. It is now gated behind `config.dangerouslySkipPermissions` (wired to
 *     Paperclip's standard UI toggle in ui/build-config.ts), defaults to false, and a
 *     warning is logged whenever it is enabled.
 *  2. `sandbox` now defaults to `true` (fail-safe) instead of `false` (fail-open). Operators
 *     must explicitly opt out.
 *  3. Same-host execution guard: by default (`requireIsolatedExecutionTarget !== false`),
 *     `execute()` refuses to run when the resolved execution target is not a remote/isolated
 *     target (SSH or sandbox) — i.e. it refuses to run directly under the Paperclip server's
 *     own OS identity. This is a direct code-level enforcement of the isolation requirement
 *     this project's charter treats as a hard bootstrap gate (B3).
 *  4. Session/conversation id capture: upstream only ever populated `sessionParams` when
 *     *resuming* an existing session; a brand-new conversation's id, as reported by `agy`
 *     itself in its own output, was never captured, so no run could ever be resumed past its
 *     first turn. This fork extracts a freshly-minted session id via
 *     `extractAntigravitySessionId` (see parse.ts) when no existing session was resumed.
 *  5. `--add-dir` path contract: upstream passed workspace `cwd` straight through to
 *     `path.resolve()`, which silently anchors a relative path against *this process's*
 *     own cwd. Since `agy` actually runs against `effectiveExecutionCwd` on
 *     `executionTarget` — frequently a remote host or sandbox with no relationship to the
 *     Paperclip server's own filesystem — that resolution could hand the CLI a path that is
 *     valid on the host but meaningless (or, worse, accidentally valid-but-wrong) on the
 *     target. Workspace cwds are now required to already be absolute; a relative one is
 *     rejected with `AntigravityRelativeWorkspacePathError` instead of being silently
 *     mis-resolved.
 *
 * @copyright Antigravity Adapter Contributors (upstream), NEXUS AI Factory (fork fixes)
 * @license MIT
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterAgent,
} from "@paperclipai/adapter-utils";
import type { AdapterExecutionTarget } from "@paperclipai/adapter-utils/execution-target";
import {
  adapterExecutionTargetIsRemote,
  adapterExecutionTargetRemoteCwd,
  overrideAdapterExecutionTargetRemoteCwd,
  adapterExecutionTargetSessionIdentity,
  adapterExecutionTargetSessionMatches,
  adapterExecutionTargetUsesPaperclipBridge,
  describeAdapterExecutionTarget,
  ensureAdapterExecutionTargetCommandResolvable,
  prepareAdapterExecutionTargetRuntime,
  readAdapterExecutionTarget,
  resolveAdapterExecutionTargetTimeoutSec,
  resolveAdapterExecutionTargetCommandForLogs,
  runAdapterExecutionTargetProcess,
  startAdapterExecutionTargetPaperclipBridge,
} from "@paperclipai/adapter-utils/execution-target";
import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  buildInvocationEnvForLogs,
  ensureAbsoluteDirectory,
  joinPromptSections,
  ensurePathInEnv,
  refreshPaperclipWorkspaceEnvForExecution,
  parseObject,
  renderTemplate,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_ANTIGRAVITY_LOCAL_MODEL, SANDBOX_INSTALL_COMMAND } from "../index.js";
import { firstNonEmptyLine } from "../utils.js";
import { extractAntigravitySessionId } from "./parse.js";
import { redactSecrets } from "./redact.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Error thrown when `execute()` refuses to run because the resolved execution target is
 * the same host as the Paperclip server and isolation has not been explicitly waived.
 */
export class AntigravitySameHostExecutionRefusedError extends Error {
  constructor() {
    super(
      "Refusing to run the Antigravity CLI directly under the Paperclip server's own OS " +
        "identity. Configure an isolated execution target (SSH or sandbox) for this agent, " +
        "or set `requireIsolatedExecutionTarget: false` in its adapter config after reviewing " +
        "the risk (same-host workers can typically reach the Paperclip server's own loopback " +
        "API). See docs/SECURITY_BOUNDARIES.md.",
    );
    this.name = "AntigravitySameHostExecutionRefusedError";
  }
}

/**
 * Error thrown when a Paperclip-registered workspace cwd handed to `--add-dir` is not
 * already an absolute path. The `agy` CLI runs against `effectiveExecutionCwd` on
 * `executionTarget` — which may be a remote host or sandbox with a filesystem unrelated to
 * this adapter's own process — so a relative path can only ever be resolved correctly by
 * the caller that knows the target's coordinate system. Resolving it here against this
 * process's own `cwd()` (the pinned-upstream behavior this fork replaced) would silently
 * hand the CLI a `--add-dir` path rooted in the wrong filesystem.
 */
export class AntigravityRelativeWorkspacePathError extends Error {
  constructor(cwd: string) {
    super(
      `Workspace cwd "${cwd}" passed to --add-dir is not absolute. Paperclip workspace ` +
        "cwds must be absolute paths in the execution target's own filesystem; this adapter " +
        "cannot resolve a relative path against the Paperclip server's own cwd, since the " +
        "Antigravity CLI runs on a possibly-remote execution target with an unrelated " +
        "filesystem.",
    );
    this.name = "AntigravityRelativeWorkspacePathError";
  }
}

/**
 * Resolves the effective working directory (CWD) paths based on agent instructions,
 * configuration fallbacks, and local strategy configurations.
 */
async function resolveEffectiveCwd(
  config: Record<string, unknown>,
  workspaceContext: Record<string, unknown>
): Promise<{ cwd: string; effectiveWorkspaceCwd: string }> {
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const configuredCwd = asString(config.cwd, "");

  const useConfiguredInsteadOfAgentHome = workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();

  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
  return { cwd, effectiveWorkspaceCwd };
}

/**
 * Builds the comprehensive environment variables mapping for process spawning,
 * injecting Antigravity specific selectors and Paperclip framework environment bindings.
 */
function buildExecutionEnvironment(
  runId: string,
  agent: AdapterAgent,
  config: Record<string, unknown>,
  model: string,
  authToken: string | null | undefined
): { env: Record<string, string>; envConfig: Record<string, unknown> } {
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  if (model && model !== DEFAULT_ANTIGRAVITY_LOCAL_MODEL) {
    env.ANTIGRAVITY_MODEL = model;
  }

  if (authToken && typeof envConfig.PAPERCLIP_API_KEY !== "string") {
    env.PAPERCLIP_API_KEY = authToken;
  }

  return { env, envConfig };
}

/**
 * Compiles the prompt template into a fully hydrated prompt payload block.
 */
function compileAgentPrompt(
  promptTemplate: string,
  agent: AdapterAgent,
  runId: string,
  context: Record<string, unknown>
): string {
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    agent,
    context,
  };

  const renderedPrompt = renderTemplate(promptTemplate, templateData);
  return joinPromptSections([renderedPrompt]);
}

/**
 * Options controlling how `compileAgyArguments` builds the argument list. Split out from
 * the upstream implicit-unconditional-flags approach so every flag's provenance is explicit
 * and the function is directly unit-testable (see tests/unit/command-args.test.ts).
 */
export interface CompileAgyArgumentsOptions {
  /** Whether to append `--sandbox`. Defaults to secure (true) one level up, in execute(). */
  sandbox: boolean;
  /**
   * Whether to append `--dangerously-skip-permissions`. Must be explicitly opted into;
   * never defaulted to true inside this function.
   */
  dangerouslySkipPermissions: boolean;
  /** Structured list of additional CLI arguments to append verbatim, after safety flags. */
  extraArgs: string[];
}

/**
 * Generates the clean CLI argument list for spawning the `agy` process.
 * Maps session IDs, prompts, and active workspaces to repeatable arguments.
 *
 * Unlike upstream, `--dangerously-skip-permissions` is only appended when explicitly
 * requested via `options.dangerouslySkipPermissions` — it is never unconditional.
 *
 * @param prompt - The compiled orchestrator prompt payload.
 * @param resumeSessionId - Optional session ID to resume (resets turn contexts).
 * @param workspaces - Active Paperclip workspace mappings to register.
 * @param options - Safety-flag and extra-argument options (see `CompileAgyArgumentsOptions`).
 * @returns An array representing the formatted CLI arguments list.
 */
export function compileAgyArguments(
  prompt: string,
  resumeSessionId: string | null,
  workspaces: unknown[],
  options: CompileAgyArgumentsOptions
): string[] {
  const args = ["--print", prompt];
  if (resumeSessionId) {
    args.push("--conversation", resumeSessionId);
  }

  for (const ws of workspaces) {
    const wsObj = parseObject(ws);
    const wsCwd = asString(wsObj.cwd, "");
    if (wsCwd.length > 0) {
      // Require an already-absolute path and normalize away `..`/`.` traversal segments
      // in place (path.normalize, unlike path.resolve, never anchors a relative input
      // against this process's own cwd). The CLI runs against `effectiveExecutionCwd` on
      // `executionTarget`, which may be a remote/sandboxed filesystem with no relationship
      // to the Paperclip server's own cwd — resolving a relative path here would silently
      // produce a path meaningful only on the wrong filesystem. Containment against a
      // single configured workspace root is deliberately not enforced here: Paperclip
      // legitimately registers multiple independent workspace directories (see
      // docs/CURRENT_STATE.md for the documented rationale).
      if (!path.isAbsolute(wsCwd)) {
        throw new AntigravityRelativeWorkspacePathError(wsCwd);
      }
      args.push("--add-dir", path.normalize(wsCwd));
    }
  }

  if (options.sandbox) {
    args.push("--sandbox");
  }
  if (options.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  if (options.extraArgs.length > 0) {
    args.push(...options.extraArgs);
  }
  return args;
}

/**
 * Core execution engine function for Google Antigravity local CLI integrations.
 * Decomposes process preparation, remote SSH workspace syncs, Paperclip bridge handshakes,
 * and command invocation into a robust, strongly-typed pipeline.
 *
 * @param ctx - The unified adapter execution context containing metadata, configurations, and logs handlers.
 * @returns A promise resolving to the final adapter execution output structure.
 */
export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;
  const executionTarget = readAdapterExecutionTarget({
    executionTarget: ctx.executionTarget,
    legacyRemoteExecution: ctx.executionTransport?.remoteExecution,
  });
  const executionTargetIsRemote = adapterExecutionTargetIsRemote(executionTarget);

  const requireIsolatedExecutionTarget = asBoolean(config.requireIsolatedExecutionTarget, true);
  if (requireIsolatedExecutionTarget && !executionTargetIsRemote) {
    throw new AntigravitySameHostExecutionRefusedError();
  }

  const promptTemplate = asString(config.promptTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const command = asString(config.command, "agy");
  const model = asString(config.model, DEFAULT_ANTIGRAVITY_LOCAL_MODEL).trim();
  // Fail-safe default: sandboxing is ON unless an operator explicitly disables it.
  // Upstream defaulted this to `false` (fail-open); see docs/UPSTREAM_PROVENANCE.md.
  const sandbox = asBoolean(config.sandbox, true);
  // Opt-in only: never defaulted to true, and always logged when enabled.
  const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, false);
  if (dangerouslySkipPermissions) {
    await onLog(
      "stdout",
      "[paperclip] WARNING: dangerouslySkipPermissions is enabled for this Antigravity run; " +
        "the CLI will bypass its own OS permission prompts.\n",
    );
  }

  const workspaceContext = parseObject(context.paperclipWorkspace);
  const { cwd, effectiveWorkspaceCwd } = await resolveEffectiveCwd(config, workspaceContext);
  let effectiveExecutionCwd = adapterExecutionTargetRemoteCwd(executionTarget, cwd);

  const { env, envConfig } = buildExecutionEnvironment(runId, agent, config, model, authToken);

  refreshPaperclipWorkspaceEnvForExecution({
    env,
    envConfig,
    workspaceCwd: effectiveWorkspaceCwd,
    workspaceSource: asString(workspaceContext.source, ""),
    workspaceId: asString(workspaceContext.workspaceId, ""),
    workspaceRepoUrl: asString(workspaceContext.repoUrl, ""),
    workspaceRepoRef: asString(workspaceContext.repoRef, ""),
    workspaceHints: [],
    agentHome: asString(workspaceContext.agentHome, ""),
    executionTargetIsRemote,
    executionCwd: effectiveExecutionCwd,
  });

  const effectiveEnv = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const runtimeEnv = Object.fromEntries(
    Object.entries(ensurePathInEnv(effectiveEnv)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const timeoutSec = resolveAdapterExecutionTargetTimeoutSec(executionTarget, asNumber(config.timeoutSec, 0));
  const graceSec = asNumber(config.graceSec, 20);

  await ensureAdapterExecutionTargetCommandResolvable(command, executionTarget, cwd, runtimeEnv, {
    installCommand: SANDBOX_INSTALL_COMMAND,
    timeoutSec,
  });

  const resolvedCommand = await resolveAdapterExecutionTargetCommandForLogs(command, executionTarget, cwd, runtimeEnv);
  const loggedEnv = buildInvocationEnvForLogs(env, {
    runtimeEnv,
    includeRuntimeKeys: ["HOME"],
    resolvedCommand,
  });

  const extraArgs = (() => {
    const fromExtraArgs = asStringArray(config.extraArgs);
    if (fromExtraArgs.length > 0) return fromExtraArgs;
    return asStringArray(config.args);
  })();

  let restoreRemoteWorkspace: (() => Promise<void>) | null = null;
  let paperclipBridge: Awaited<ReturnType<typeof startAdapterExecutionTargetPaperclipBridge>> = null;
  let preparedExecutionTargetRuntime: Awaited<ReturnType<typeof prepareAdapterExecutionTargetRuntime>> | null = null;

  if (executionTargetIsRemote) {
    try {
      await onLog("stdout", `[paperclip] Preparing remote execution target ${describeAdapterExecutionTarget(executionTarget)}...\n`);
      preparedExecutionTargetRuntime = await prepareAdapterExecutionTargetRuntime({
        runId,
        target: executionTarget,
        adapterKey: "antigravity",
        timeoutSec,
        workspaceLocalDir: cwd,
        installCommand: SANDBOX_INSTALL_COMMAND,
        detectCommand: command,
        assets: [],
      });
      restoreRemoteWorkspace = () => preparedExecutionTargetRuntime!.restoreWorkspace();
      effectiveExecutionCwd = preparedExecutionTargetRuntime.workspaceRemoteDir ?? effectiveExecutionCwd;
    } catch (error) {
      await restoreRemoteWorkspace?.();
      throw error;
    }
  }

  const runtimeExecutionTarget = overrideAdapterExecutionTargetRemoteCwd(executionTarget, effectiveExecutionCwd);

  if (executionTargetIsRemote && adapterExecutionTargetUsesPaperclipBridge(executionTarget)) {
    paperclipBridge = await startAdapterExecutionTargetPaperclipBridge({
      runId,
      target: runtimeExecutionTarget,
      runtimeRootDir: preparedExecutionTargetRuntime?.runtimeRootDir ?? null,
      adapterKey: "antigravity",
      timeoutSec,
      hostApiToken: env.PAPERCLIP_API_KEY,
      onLog,
    });
    if (paperclipBridge) {
      Object.assign(env, paperclipBridge.env);
    }
  }

  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const runtimeSessionId = asString(runtimeSessionParams.sessionId, runtime.sessionId ?? "");
  const runtimeRemoteExecution = parseObject(runtimeSessionParams.remoteExecution);

  // Bind resume lookups to workspace identity, not just execution-target identity: a
  // session id is only a valid key within the workspace it was minted in. Without this,
  // a session id that happened to match on a shared/remote execution target could be
  // resumed against an unrelated workspace (collision risk flagged in security review).
  // The saved cwd must ALWAYS match the resolved effective execution cwd, since that is
  // always populated for every session this adapter itself persists; a matching
  // workspaceId is an additional requirement layered on top when either side declares
  // one (exact match required), not a substitute for the cwd check. A workspaceId can
  // persist across a path change (e.g. a repo re-checked-out elsewhere, or a Paperclip
  // workspace re-pointed to a different directory while keeping the same logical id), so
  // trusting the id alone would let a resumed session leak across that workspace boundary.
  const currentWorkspaceId = asString(workspaceContext.workspaceId, "");
  const storedWorkspaceId = asString(runtimeSessionParams.workspaceId, "");
  const cwdMatches = asString(runtimeSessionParams.cwd, "") === effectiveExecutionCwd;
  const workspaceIdentityMatches =
    currentWorkspaceId.length > 0 || storedWorkspaceId.length > 0
      ? currentWorkspaceId === storedWorkspaceId && cwdMatches
      : cwdMatches;

  const canResumeSession =
    runtimeSessionId.length > 0 &&
    workspaceIdentityMatches &&
    adapterExecutionTargetSessionMatches(runtimeRemoteExecution, runtimeExecutionTarget);
  const resumeSessionId = canResumeSession ? runtimeSessionId : null;

  const prompt = compileAgentPrompt(promptTemplate, agent, runId, context);

  const runAttempt = async (resumeId: string | null) => {
    const workspaces = Array.isArray(context.paperclipWorkspaces) ? context.paperclipWorkspaces : [];
    const args = compileAgyArguments(prompt, resumeId, workspaces, {
      sandbox,
      dangerouslySkipPermissions,
      extraArgs,
    });

    if (onMeta) {
      await onMeta({
        adapterType: "antigravity_local",
        command: resolvedCommand,
        cwd: effectiveExecutionCwd,
        commandNotes: ["Running Antigravity CLI in headless print mode"],
        commandArgs: args.map((val, idx) => (idx === 1 ? `<prompt ${prompt.length} chars>` : val)),
        env: loggedEnv,
        prompt,
        promptMetrics: { promptChars: prompt.length },
        context,
      });
    }

    return await runAdapterExecutionTargetProcess(runId, runtimeExecutionTarget, command, args, {
      cwd,
      env,
      timeoutSec,
      graceSec,
      onSpawn,
      onLog,
    });
  };

  try {
    const proc = await runAttempt(resumeSessionId);

    if (proc.timedOut) {
      return {
        exitCode: proc.exitCode,
        signal: proc.signal,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        errorCode: null,
        clearSession: false,
      };
    }

    // A process killed by a signal reports `exitCode: null`; treat that as a failure in its
    // own right rather than defaulting the missing exit code to 0 (success). Upstream of this
    // fix, a signal-terminated run with no exit code silently reported as successful.
    const failed = proc.exitCode !== 0 || Boolean(proc.signal);

    // Single shared sanitization path: anything derived from raw CLI stdout/stderr — the
    // error message, the summary, and resultJson.raw below — goes through this redaction
    // before it can reach a thrown error or a returned field, so credential material (or
    // other secrets the CLI process was launched with) echoed back by a failing/misbehaving
    // CLI can never leak through to the caller.
    const cliSecrets = [authToken, env.PAPERCLIP_API_KEY, envConfig.ANTIGRAVITY_API_KEY as string | undefined];
    const rawStdout = redactSecrets(proc.stdout.trim(), cliSecrets);
    const rawStderr = redactSecrets(proc.stderr.trim(), cliSecrets);
    const fallbackErrorMessage =
      firstNonEmptyLine(rawStderr) ||
      (proc.signal ? `Antigravity terminated by signal ${proc.signal}` : `Antigravity exited with code ${proc.exitCode ?? -1}`);

    // Resolve the session id to persist: prefer the one we resumed; otherwise, on a
    // successful fresh run, try to recover the id `agy` itself minted for the new
    // conversation so the *next* run can resume it. Upstream never attempted this second
    // path, so new conversations could never be resumed past their first turn.
    const newlyMintedSessionId = !resumeSessionId && !failed ? extractAntigravitySessionId(rawStdout, rawStderr) : null;
    const sessionId = resumeSessionId || newlyMintedSessionId;

    const resolvedSessionParams = sessionId
      ? {
          sessionId,
          cwd: effectiveExecutionCwd,
          ...(asString(workspaceContext.workspaceId, "") ? { workspaceId: workspaceContext.workspaceId } : {}),
          ...(executionTargetIsRemote ? { remoteExecution: adapterExecutionTargetSessionIdentity(runtimeExecutionTarget) } : {}),
        }
      : null;

    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: false,
      errorMessage: failed ? fallbackErrorMessage : null,
      errorCode: null,
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      sessionId: sessionId || null,
      sessionParams: resolvedSessionParams,
      sessionDisplayId: sessionId || null,
      provider: "google",
      biller: "google",
      model,
      billingType: "api",
      costUsd: null,
      resultJson: { raw: rawStdout },
      summary: failed ? "" : rawStdout,
      question: null,
      clearSession: false,
    };
  } finally {
    await Promise.all([
      paperclipBridge?.stop(),
      restoreRemoteWorkspace?.(),
    ]);
  }
}
