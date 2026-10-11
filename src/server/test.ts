/**
 * @fileoverview Environment connection probe and diagnostic checks for Antigravity local executions.
 * Performs deep, step-by-step diagnostic checks validating filesystem permissions, CLI presence,
 * credentials, sandboxing triggers, and live API connectivity through a hello telemetry probe.
 *
 * Forked from `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2`. See docs/UPSTREAM_PROVENANCE.md.
 *
 * Fork changes: the hello probe builds its argument list from a fixed set — `--print`, the
 * literal probe prompt, and an optional `--sandbox` — that cannot be extended by caller
 * config. `--dangerously-skip-permissions` and any configured `extraArgs`/`args` are never
 * appended to the probe call, structurally (not just by convention), because a prior version
 * read both `config.dangerouslySkipPermissions` and `config.extraArgs` into the probe's
 * argument list, which meant an operator could smuggle the dangerous flag onto the opt-in-only
 * probe through `extraArgs` even with `dangerouslySkipPermissions` left at its default `false`
 * (see security review on PR #1). The check list also surfaces same-host execution risk
 * explicitly instead of staying silent about it.
 *
 * @copyright Antigravity Adapter Contributors (upstream), NEXUS AI Factory (fork changes)
 * @license MIT
 */

import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import type { AdapterExecutionTarget } from "@paperclipai/adapter-utils/execution-target";
import {
  asBoolean,
  asNumber,
  asString,
  ensurePathInEnv,
  parseObject,
} from "@paperclipai/adapter-utils/server-utils";
import {
  adapterExecutionTargetIsRemote,
  ensureAdapterExecutionTargetCommandResolvable,
  maybeRunSandboxInstallCommand,
  ensureAdapterExecutionTargetDirectory,
  runAdapterExecutionTargetProcess,
  describeAdapterExecutionTarget,
  resolveAdapterExecutionTargetCwd,
} from "@paperclipai/adapter-utils/execution-target";
import { DEFAULT_ANTIGRAVITY_LOCAL_MODEL, SANDBOX_INSTALL_COMMAND } from "../index.js";
import { detectAntigravityAuthRequired, detectAntigravityQuotaExhausted } from "./parse.js";
import { firstNonEmptyLine, commandLooksLike, isNonEmptyString } from "../utils.js";

/**
 * Summarizes the combined status from a list of environmental diagnostic checks.
 */
function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) {
    return "fail";
  }
  if (checks.some((check) => check.level === "warn")) {
    return "warn";
  }
  return "pass";
}

/**
 * Summarizes process stdout/stderr into a single cleaned, length-bounded line.
 */
function summarizeProbeDetail(stdout: string, stderr: string): string | null {
  const raw = firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!raw) {
    return null;
  }
  const clean = raw.replace(/\s+/g, " ").trim();
  const max = 240;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Validates whether the configured target execution directory exists or is mountable.
 */
async function checkWorkingDirectory(
  runId: string,
  target: AdapterExecutionTarget | null,
  cwd: string,
): Promise<AdapterEnvironmentCheck> {
  try {
    await ensureAdapterExecutionTargetDirectory(runId, target, cwd, {
      cwd,
      env: {},
      createIfMissing: true,
    });
    return {
      code: "antigravity_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    };
  } catch (err) {
    return {
      code: "antigravity_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    };
  }
}

/**
 * Checks whether the execution target is isolated from the Paperclip server's own host,
 * matching the guard enforced at run time in execute.ts. Surfaced here so operators see
 * the risk during setup, not only as a hard failure on the first real run.
 */
function checkExecutionIsolation(
  target: AdapterExecutionTarget | null,
  requireIsolatedExecutionTarget: boolean,
): AdapterEnvironmentCheck {
  const isRemote = adapterExecutionTargetIsRemote(target);
  if (isRemote) {
    return {
      code: "antigravity_execution_isolated",
      level: "info",
      message: `Execution target is isolated: ${describeAdapterExecutionTarget(target)}`,
    };
  }
  if (requireIsolatedExecutionTarget) {
    return {
      code: "antigravity_execution_not_isolated_blocked",
      level: "error",
      message:
        "No isolated execution target is configured. Runs will be refused until an SSH/sandbox " +
        "target is attached, or requireIsolatedExecutionTarget is explicitly disabled.",
    };
  }
  return {
    code: "antigravity_execution_not_isolated_allowed",
    level: "warn",
    message:
      "requireIsolatedExecutionTarget is disabled: this agent will run directly under the " +
      "Paperclip server's own OS identity. Confirm this is an explicit, reviewed decision.",
  };
}

/**
 * Builds and resolves execution target environment variables from adapter configuration.
 */
function resolveExecutionEnvironment(config: Record<string, unknown>): Record<string, string> {
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }

  const model = asString(config.model, DEFAULT_ANTIGRAVITY_LOCAL_MODEL).trim();
  if (model && model !== DEFAULT_ANTIGRAVITY_LOCAL_MODEL) {
    env.ANTIGRAVITY_MODEL = model;
  }

  return env;
}

/**
 * Diagnoses the availability of API key credentials within local configuration or host context.
 */
function checkApiCredentials(
  env: Record<string, string>,
  targetIsRemote: boolean,
): AdapterEnvironmentCheck {
  const configApiKey = env.ANTIGRAVITY_API_KEY;
  const hostApiKey = targetIsRemote ? undefined : process.env.ANTIGRAVITY_API_KEY;

  if (isNonEmptyString(configApiKey) || isNonEmptyString(hostApiKey)) {
    return {
      code: "antigravity_api_key_present",
      level: "info",
      message: "Antigravity API credentials are set.",
      detail: "Detected in environment variables.",
    };
  }

  return {
    code: "antigravity_api_key_missing",
    level: "info",
    message: "No explicit ANTIGRAVITY_API_KEY detected. The CLI may use the system keyring.",
    hint: "If the probe fails, check your API key or run `agy install` via CLI.",
  };
}

/**
 * Performs a live telemetry "hello" probe calling the executable with basic prompts
 * to confirm API reachability, sandbox limits, turn safety, and license status.
 */
async function performHelloTelemetryProbe(
  runId: string,
  target: AdapterExecutionTarget | null,
  command: string,
  cwd: string,
  env: Record<string, string>,
  config: Record<string, unknown>,
  checks: AdapterEnvironmentCheck[],
): Promise<void> {
  if (!commandLooksLike(command, "agy")) {
    checks.push({
      code: "antigravity_hello_probe_skipped_custom_command",
      level: "info",
      message: "Skipped hello probe because command is not `agy`.",
      detail: command,
    });
    return;
  }

  const sandbox = asBoolean(config.sandbox, true);
  const helloProbeTimeoutSec = Math.max(1, asNumber(config.helloProbeTimeoutSec, 60));

  // Fixed arg list: the diagnostic probe never needs, and must never receive, the dangerous
  // permission-bypass flag or any caller-supplied extraArgs/args — those are opt-in for real
  // execution only. Building this list from literals (not spreading any config-derived array)
  // closes the path structurally rather than relying on convention.
  const args = ["--print", "Respond with hello."];
  if (sandbox) {
    args.push("--sandbox");
  }

  const probe = await runAdapterExecutionTargetProcess(
    runId,
    target,
    command,
    args,
    {
      cwd,
      env,
      timeoutSec: helloProbeTimeoutSec,
      graceSec: 5,
      onLog: async () => {},
    },
  );

  const detail = summarizeProbeDetail(probe.stdout, probe.stderr);

  const authMeta = detectAntigravityAuthRequired({
    stdout: probe.stdout,
    stderr: probe.stderr,
  });

  const quotaMeta = detectAntigravityQuotaExhausted({
    stdout: probe.stdout,
    stderr: probe.stderr,
  });

  if (quotaMeta.exhausted) {
    checks.push({
      code: "antigravity_hello_probe_quota_exhausted",
      level: "warn",
      message: "Antigravity API key is over quota.",
      ...(detail ? { detail } : {}),
      hint: "Check usage/billing, then retry the probe.",
    });
  } else if (probe.timedOut) {
    checks.push({
      code: "antigravity_hello_probe_timed_out",
      level: "warn",
      message: "Antigravity hello probe timed out.",
      hint: "Retry the probe. If this persists, verify Antigravity can run manually.",
    });
  } else if ((probe.exitCode ?? 1) === 0) {
    const summary = probe.stdout.trim().toLowerCase();
    const hasHello = summary.includes("hello") || summary.includes("olá");

    checks.push({
      code: hasHello ? "antigravity_hello_probe_passed" : "antigravity_hello_probe_unexpected_output",
      level: hasHello ? "info" : "warn",
      message: hasHello
        ? "Antigravity hello probe succeeded."
        : "Antigravity probe ran but did not return `hello` or `olá` as expected.",
      ...(summary ? { detail: summary.slice(0, 240) } : {}),
    });
  } else if (authMeta.requiresAuth) {
    checks.push({
      code: "antigravity_hello_probe_auth_required",
      level: "warn",
      message: "Antigravity CLI is installed, but authentication is missing.",
      ...(detail ? { detail } : {}),
    });
  } else {
    checks.push({
      code: "antigravity_hello_probe_failed",
      level: "error",
      message: "Antigravity hello probe failed.",
      ...(detail ? { detail } : {}),
    });
  }
}

/**
 * Diagnostic pipeline testing the Antigravity installation and credentials environment.
 */
export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "agy");
  const target = ctx.executionTarget ?? null;
  const targetIsRemote = target?.kind === "remote";
  const cwd = resolveAdapterExecutionTargetCwd(target, asString(config.cwd, ""), process.cwd());
  const targetLabel = targetIsRemote
    ? ctx.environmentName ?? describeAdapterExecutionTarget(target)
    : null;

  const runId = `antigravity-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (targetLabel) {
    checks.push({
      code: "antigravity_environment_target",
      level: "info",
      message: `Probing inside environment: ${targetLabel}`,
    });
  }

  // Step 1: Surface same-host execution isolation risk up front.
  const requireIsolatedExecutionTarget = asBoolean(config.requireIsolatedExecutionTarget, true);
  checks.push(checkExecutionIsolation(target, requireIsolatedExecutionTarget));

  // Step 2: Validate local or remote working directory
  const cwdCheck = await checkWorkingDirectory(runId, target, cwd);
  checks.push(cwdCheck);

  // Step 3: Build execution environment variable mappings
  const env = resolveExecutionEnvironment(config);
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  // Step 4: Handle sandbox execution installs if sandbox configurations are active
  const installCheck = await maybeRunSandboxInstallCommand({
    runId,
    target,
    adapterKey: "antigravity",
    installCommand: SANDBOX_INSTALL_COMMAND,
    detectCommand: command,
    env,
  });
  if (installCheck) {
    checks.push(installCheck);
  }

  // Step 5: Verify that the main command executable is resolvable and accessible in PATH
  let commandResolvable = false;
  try {
    await ensureAdapterExecutionTargetCommandResolvable(command, target, cwd, runtimeEnv);
    checks.push({
      code: "antigravity_command_resolvable",
      level: "info",
      message: `Command is executable: ${command}`,
    });
    commandResolvable = true;
  } catch (err) {
    checks.push({
      code: "antigravity_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "Command is not executable",
      detail: command,
    });
  }

  // Step 6: Check configured API keys and authentication contexts
  const credsCheck = checkApiCredentials(env, targetIsRemote);
  checks.push(credsCheck);

  // Step 7: Spawn live "hello" telemetry probe if directories and executables resolved correctly,
  // and isolation was not a hard-blocking failure.
  const canRunProbe =
    cwdCheck.code === "antigravity_cwd_valid" &&
    commandResolvable &&
    !(requireIsolatedExecutionTarget && !adapterExecutionTargetIsRemote(target));
  if (canRunProbe) {
    await performHelloTelemetryProbe(runId, target, command, cwd, env, config, checks);
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
