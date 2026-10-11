/**
 * @fileoverview Configuration and session type definitions for the Antigravity local CLI adapter.
 *
 * Forked from `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2` (MIT License, (c) 2026 Weslley Capelari).
 * See docs/UPSTREAM_PROVENANCE.md and THIRD_PARTY_NOTICES.md for full attribution.
 *
 * Security-relevant changes made in this fork (tracked in docs/UPSTREAM_PROVENANCE.md):
 *  - `dangerouslySkipPermissions` is now an explicit, opt-in field wired to Paperclip's
 *    standard `CreateConfigValues.dangerouslySkipPermissions` UI toggle, instead of being
 *    unconditionally appended to every CLI invocation.
 *  - `requireIsolatedExecutionTarget` added (defaults to true in the execution engine) to
 *    refuse same-host execution unless an operator has explicitly reviewed and opted out.
 *
 * @copyright Antigravity Adapter Contributors (upstream), NEXUS AI Factory (fork changes)
 * @license MIT
 */

/**
 * Represents an environment variable binding with a literal/plain-text value.
 */
export interface EnvBindingPlain {
  /** The binding type identifier. Must always be "plain". */
  type: "plain";
  /** The plain-text value of the environment variable. */
  value: string;
}

/**
 * Represents an environment variable binding referencing a secret
 * securely managed by Paperclip's credentials vault.
 */
export interface EnvBindingSecretRef {
  /** The binding type identifier. Must always be "secret_ref". */
  type: "secret_ref";
  /** The unique identifier of the secret stored securely in Paperclip. */
  secretId: string;
  /**
   * The version of the secret to retrieve.
   * Can be a sequential version number or "latest" to fetch the most recent value.
   */
  version?: number | "latest";
}

/** Union type representing the possible ways to bind environment variables in Paperclip. */
export type EnvBinding = EnvBindingPlain | EnvBindingSecretRef;

/** A key-value collection indexed by strings representing strongly-typed environment variables. */
export type EnvBindings = Record<string, EnvBinding>;

/**
 * Raw and unstructured configuration values received directly from Paperclip's web console.
 * Contains strings and generic objects entered by the user in the UI.
 */
export interface AntigravityRawConfigValues {
  /** Optional absolute path of the default working directory fallback. */
  cwd?: string;
  /** Optional absolute path of the markdown file (.md) containing system instructions. */
  instructionsFilePath?: string;
  /** The initial prompt execution template containing dynamic wildcards/tags. */
  promptTemplate?: string;
  /** The AI model identifier (e.g., "gemini-3.5-flash"). */
  model?: string;
  /** The terminal command that executes the Antigravity binary. Defaults to "agy". */
  command?: string;
  /** Additional command-line arguments entered via the UI, separated by commas. */
  extraArgs?: string;
  /** Legacy additional command-line arguments, separated by commas. */
  args?: string;
  /** Legacy block of environment variables in KEY=VALUE format per line. */
  envVars?: string;
  /** Dictionary containing the structured environment bindings (plain or secret_ref). */
  envBindings?: unknown;
  /** If true, dangerously bypasses the operating system security sandbox. */
  dangerouslyBypassSandbox?: boolean;
  /**
   * If true, appends `--dangerously-skip-permissions` to the `agy` invocation. Mirrors
   * Paperclip's standard `CreateConfigValues.dangerouslySkipPermissions` toggle. Defaults
   * to false: the upstream behavior of always passing this flag is a known risk this fork
   * fixes (see docs/UPSTREAM_PROVENANCE.md).
   */
  dangerouslySkipPermissions?: boolean;
  /** The global run timeout in seconds for agent execution. */
  timeoutSec?: unknown;
  /** The grace period in seconds before forcibly killing the process with SIGKILL. */
  graceSec?: unknown;
  /** The timeout in seconds specifically for the initial connection probe (Self-test). */
  helloProbeTimeoutSec?: unknown;
  /**
   * If false, refuses to execute when the resolved execution target is the same host as
   * the Paperclip server (i.e. not an isolated SSH/sandbox target). Defaults to true.
   */
  requireIsolatedExecutionTarget?: boolean;
}

/**
 * Strict and strongly-typed configuration structure used internally
 * by the adapter's execution engine.
 */
export interface AntigravityAdapterConfig {
  /** The absolute path of the default process working directory. */
  cwd?: string;
  /** The absolute path of the markdown file containing system instructions. */
  instructionsFilePath?: string;
  /** The compiled template of the orchestrator agent prompt. */
  promptTemplate?: string;
  /** The unique model identifier (e.g., "claude-sonnet-4.6-thinking" or "auto"). */
  model: string;
  /** The executable binary command. Typically resolves to "agy". */
  command?: string;
  /** Structured list of additional CLI arguments passed to the Antigravity process. */
  extraArgs?: string[];
  /** Structured list of legacy additional arguments passed to the process. */
  args?: string[];
  /** Strongly-typed collection of environment variables injected into the child process. */
  env?: EnvBindings;
  /** Indicates whether CLI terminal and file system security restrictions are enabled. */
  sandbox?: boolean;
  /** Whether to pass `--dangerously-skip-permissions`. Opt-in; defaults to false. */
  dangerouslySkipPermissions?: boolean;
  /** Whether same-host (non-isolated) execution is permitted. Opt-out; defaults to true (required). */
  requireIsolatedExecutionTarget?: boolean;
  /** The inactivity timeout in seconds. Zero indicates unlimited execution time. */
  timeoutSec?: number;
  /** The process termination grace period in seconds after SIGTERM. Defaults to 15. */
  graceSec?: number;
  /** The probe timeout in seconds. Defaults to 60. */
  helloProbeTimeoutSec?: number;
}

/**
 * Structured parameters for Antigravity conversation session persistence.
 * Allows restoring the history and state of a prior run in subsequent heartbeats.
 */
export interface AntigravitySessionParams extends Record<string, unknown> {
  /** The conversation ID generated natively by the Antigravity CLI. */
  sessionId: string;
  /** The absolute working directory of the active session. */
  cwd?: string;
  /** The ID of the active workspace associated with this session in Paperclip. */
  workspaceId?: string;
  /** The Git repository URL of the project, if applicable. */
  repoUrl?: string;
  /** The Git reference (branch, commit, or tag) active in the workspace repository. */
  repoRef?: string;
  /** Optional structured metadata of the remote execution environment (SSH/Sandbox). */
  remoteExecution?: Record<string, unknown> | null;
}

/** Structured definition of a model supported by the adapter, mapped to Paperclip's graphical interface. */
export interface AntigravityModelDefinition {
  /** Technical ID passed to the ANTIGRAVITY_MODEL environment variable (e.g., "claude-sonnet-4.6-thinking"). */
  id: string;
  /** User-friendly label displayed in Paperclip's web console (e.g., "Claude Sonnet 4.6 (Thinking)"). */
  label: string;
}

// NOTE: upstream (pinned at commit 691725a6...) also declared an
// `AntigravityModelProfileDefinition` type and a `modelProfiles` export, built against
// an older `@paperclipai/adapter-utils` (^2026.525.0) that had a `modelProfiles` concept
// on `ServerAdapterModule` and an `AdapterModelProfileKey` type. Neither exists in the
// `2026.1005.0` release this fork targets (verified: `ServerAdapterModule` has no
// `modelProfiles` field, and `AdapterModelProfileKey` is not exported). Dropped rather
// than shimmed, since there is nothing in the current platform for it to wire into.
// See docs/UPSTREAM_PROVENANCE.md.
