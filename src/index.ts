/**
 * @fileoverview Paperclip adapter module entry point for the Antigravity (`agy`) local CLI.
 *
 * Forked from `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2` (MIT License, (c) 2026 Weslley Capelari).
 * See docs/UPSTREAM_PROVENANCE.md and THIRD_PARTY_NOTICES.md for full attribution and the
 * list of security-relevant changes made in this fork.
 *
 * @copyright Antigravity Adapter Contributors (upstream), NEXUS AI Factory (fork changes)
 * @license MIT
 */
import { type ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute, testEnvironment } from "./server/index.js";
import type { AntigravityModelDefinition } from "./types.js";

export const type = "antigravity_local";
export const label = "Antigravity CLI (local)";

// Antigravity uses a direct install script (Go binary) instead of NPM.
export const SANDBOX_INSTALL_COMMAND = "curl -sSL https://antigravity.google/install.sh | bash";

export const DEFAULT_ANTIGRAVITY_LOCAL_MODEL = "auto";

export const models: AntigravityModelDefinition[] = [
  { id: DEFAULT_ANTIGRAVITY_LOCAL_MODEL, label: "Auto (Use global configured default)" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (Medium)" },
  { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" },
  { id: "gemini-3.1-pro-low", label: "Gemini 3.1 Pro (Low)" },
  { id: "claude-sonnet-4.6-thinking", label: "Claude Sonnet 4.6 (Thinking)" },
  { id: "claude-opus-4.6-thinking", label: "Claude Opus 4.6 (Thinking)" },
  { id: "gpt-oss-120b", label: "GPT-OSS 120B (Medium)" },
];

// Upstream also declared a `modelProfiles` export here, targeting an older
// `@paperclipai/adapter-utils` release that supported a model-profile concept on
// `ServerAdapterModule`. That concept does not exist in the `2026.1005.0` release this
// fork targets, so it has been dropped rather than shimmed. See docs/UPSTREAM_PROVENANCE.md.

export const agentConfigurationDoc = `# antigravity_local agent configuration

Adapter: antigravity_local

Use when:
- You want Paperclip to run the Antigravity CLI on an isolated execution target
  (SSH worker or sandbox) that Paperclip orchestrates
- You want to leverage native Go performance and improved startup times
- You want Paperclip skills injected locally via Antigravity plugin paths

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process
- instructionsFilePath (string, optional): absolute path to a markdown instructions file
- promptTemplate (string, optional): run prompt template
- model (string, optional): Antigravity model id. Defaults to auto.
- command (string, optional): defaults to "agy"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Safety fields (fork additions; see docs/UPSTREAM_PROVENANCE.md):
- sandbox (boolean, optional): defaults to true. Appends \`--sandbox\`. Must be explicitly
  disabled to run unsandboxed.
- dangerouslySkipPermissions (boolean, optional): defaults to false. Appends
  \`--dangerously-skip-permissions\` ONLY when explicitly set to true. A warning is logged
  whenever this is enabled.
- requireIsolatedExecutionTarget (boolean, optional): defaults to true. When true, \`execute()\`
  refuses to run unless the resolved execution target is an isolated SSH/sandbox target,
  i.e. not the same host as the Paperclip server itself.

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Runs use positional prompt arguments.
- Authentication utilizes the native OS keyring or ANTIGRAVITY_API_KEY environment variable.
- Conversation/session ids are captured both when resuming an existing session and (new in
  this fork) when a run mints a brand-new one, so multi-turn sessions survive past their
  first turn.
`;

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    models,
    supportsInstructionsBundle: true,
    instructionsPathKey: "instructionsFilePath",
    agentConfigurationDoc,
  };
}
