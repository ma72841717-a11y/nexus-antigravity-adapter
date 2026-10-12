/**
 * @fileoverview Configuration builder mapping Web UI settings into strongly-typed Antigravity configs.
 * Parses raw text-based envs, process variables bindings, custom flags, and model preferences.
 *
 * Forked from `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2`. See docs/UPSTREAM_PROVENANCE.md.
 *
 * Fork fix: upstream never read Paperclip's standard `dangerouslySkipPermissions` UI toggle
 * at all — the flag was instead hardcoded unconditionally inside execute.ts's argument
 * builder, so this checkbox had no effect for this adapter. This builder now wires it
 * through like every other adapter does.
 *
 * @copyright Antigravity Adapter Contributors (upstream), NEXUS AI Factory (fork fix)
 * @license MIT
 */

import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_ANTIGRAVITY_LOCAL_MODEL } from "../index.js";
import type { AntigravityAdapterConfig, EnvBindings } from "../types.js";
import { parseCommaArgs, parseMultilineLines } from "../utils.js";

/** Regex pattern validating compliance with standard POSIX environment variable name specifications. */
const ENV_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isValidEnvVariableName(name: string): boolean {
  return ENV_VAR_NAME_RE.test(name);
}

/**
 * Parses raw multilines text variables definitions (e.g., KEY=VALUE) into a plain dictionary.
 */
function parseEnvVars(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of parseMultilineLines(text)) {
    if (line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);

    if (!isValidEnvVariableName(key)) {
      continue;
    }
    env[key] = value;
  }
  return env;
}

/**
 * Validates and maps structured Paperclip variable bindings (plain or secret references).
 */
function parseEnvBindings(bindings: unknown): Record<string, unknown> {
  if (typeof bindings !== "object" || bindings === null || Array.isArray(bindings)) {
    return {};
  }
  const env: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(bindings)) {
    if (!isValidEnvVariableName(key)) {
      continue;
    }
    if (typeof raw === "string") {
      env[key] = { type: "plain", value: raw };
      continue;
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      continue;
    }
    const rec = raw as Record<string, unknown>;
    if (rec.type === "plain" && typeof rec.value === "string") {
      env[key] = { type: "plain", value: rec.value };
      continue;
    }
    if (rec.type === "secret_ref" && typeof rec.secretId === "string") {
      env[key] = {
        type: "secret_ref",
        secretId: rec.secretId,
        ...(typeof rec.version === "number" || rec.version === "latest"
          ? { version: rec.version }
          : {}),
      };
    }
  }
  return env;
}

/**
 * Builds the strongly-typed Antigravity local config structure from Web UI values.
 *
 * Safe-by-default: `sandbox` is true unless the operator explicitly checks "dangerously
 * bypass sandbox", and `dangerouslySkipPermissions` is false unless the operator explicitly
 * checks Paperclip's standard "dangerously skip permissions" toggle. Neither flag is ever
 * forced on by this builder.
 */
export function buildAntigravityLocalConfig(v: CreateConfigValues): AntigravityAdapterConfig {
  const ac: AntigravityAdapterConfig = {
    model: v.model || DEFAULT_ANTIGRAVITY_LOCAL_MODEL,
    timeoutSec: 0,
    graceSec: 15,
  };
  if (v.cwd) {
    ac.cwd = v.cwd;
  }
  if (v.instructionsFilePath) {
    ac.instructionsFilePath = v.instructionsFilePath;
  }

  const env = parseEnvBindings(v.envBindings) as EnvBindings;
  const legacy = parseEnvVars(v.envVars);
  for (const [key, value] of Object.entries(legacy)) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      env[key] = { type: "plain", value };
    }
  }
  if (Object.keys(env).length > 0) {
    ac.env = env;
  }
  ac.sandbox = !v.dangerouslyBypassSandbox;
  ac.dangerouslySkipPermissions = Boolean(v.dangerouslySkipPermissions);

  if (v.command) {
    ac.command = v.command;
  }
  if (v.extraArgs) {
    ac.extraArgs = parseCommaArgs(v.extraArgs);
  }
  return ac;
}
