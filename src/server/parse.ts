/**
 * @fileoverview Log parsers and telemetry analysis helpers for the Antigravity local CLI execution.
 * Extracts specific execution failures, rate limits, session statuses, and authentication triggers
 * from stdout/stderr, and (new in this fork) extracts freshly-minted conversation IDs.
 *
 * Forked from `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2`. See docs/UPSTREAM_PROVENANCE.md.
 *
 * `extractAntigravitySessionId` below is new in this fork: upstream had no mechanism to
 * capture a *newly created* conversation ID from the CLI's own output on a fresh (non-resume)
 * run, so the session could never be resumed after its first turn. See execute.ts.
 *
 * @copyright Antigravity Adapter Contributors (upstream), NEXUS AI Factory (fork additions)
 * @license MIT
 */

import { parseMultilineLines } from "../utils.js";

/**
 * Combines and normalizes stdout and stderr into a single list of trimmed, non-empty lines.
 */
function combineAndCleanLines(stdout: string, stderr: string): string[] {
  return parseMultilineLines(`${stdout}\n${stderr}`);
}

/** Regex pattern to identify CLI authentication failures or key missing errors. */
const AGY_AUTH_REQUIRED_RE = /(?:not\s+authenticated|please\s+authenticate|api[_ ]?key\s+(?:required|missing|invalid)|authentication\s+required|unauthorized|invalid\s+credentials|not\s+logged\s+in|login\s+required|run\s+`?agy\s+auth(?:\s+login)?`?\s+first)/i;

/** Regex pattern to identify API quota exhaustions, billing issues, or rate limits. */
const AGY_QUOTA_EXHAUSTED_RE = /(?:resource_exhausted|quota|rate[-\s]?limit|too many requests|\b429\b|billing details)/i;

/**
 * Matches lines where the Antigravity CLI reports the conversation/session id it minted
 * for a fresh run, e.g. `Conversation ID: abc-123`, `session_id=abc-123`, or a JSON-ish
 * `"conversationId": "abc-123"` fragment. Deliberately permissive across the naming
 * variants observed across CLI tools of this shape (conversation/session/conv, with or
 * without an id suffix, separated by `:`, `=`, or JSON `": "`).
 */
const AGY_SESSION_ID_RE =
  /(?:conversation|session|conv)[_\s]?id["']?\s*[:=]\s*["']?([a-zA-Z0-9][a-zA-Z0-9_-]{3,127})["']?/i;

/**
 * Checks whether the CLI process execution failed because the requested conversation
 * session was unknown, deleted, or otherwise not found.
 */
export function isAntigravityUnknownSessionError(stdout: string, stderr: string): boolean {
  const haystack = combineAndCleanLines(stdout, stderr).join("\n");

  return /unknown\s+conversation|conversation\s+.*\s+not\s+found|resume\s+.*\s+not\s+found|cannot\s+resume|failed\s+to\s+resume/i.test(
    haystack,
  );
}

/**
 * Probes stdout/stderr output lines for missing authentication configurations.
 */
export function detectAntigravityAuthRequired(input: {
  stdout: string;
  stderr: string;
}): { requiresAuth: boolean } {
  const messages = combineAndCleanLines(input.stdout, input.stderr);
  const requiresAuth = messages.some((line) => AGY_AUTH_REQUIRED_RE.test(line));
  return { requiresAuth };
}

/**
 * Checks if the Antigravity execution failed because of billing quotas,
 * rate-limits (HTTP 429), or API resource limit exhaustion.
 */
export function detectAntigravityQuotaExhausted(input: {
  stdout: string;
  stderr: string;
}): { exhausted: boolean } {
  const messages = combineAndCleanLines(input.stdout, input.stderr);
  const exhausted = messages.some((line) => AGY_QUOTA_EXHAUSTED_RE.test(line));
  return { exhausted };
}

/**
 * Detects if the run hit the safety maximum agent turn thresholds.
 */
export function isAntigravityTurnLimitResult(
  exitCode?: number | null,
  stderr?: string
): boolean {
  if (exitCode === 53) {
    return true;
  }

  if (stderr) {
    const lowerStderr = stderr.toLowerCase();
    if (lowerStderr.includes("turn_limit") || lowerStderr.includes("max_turns")) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts a concise error description representing the first failure log line.
 */
export function describeAntigravityFailure(stdout: string, stderr: string): string | null {
  const lines = parseMultilineLines(`${stderr}\n${stdout}`);
  if (lines.length === 0) {
    return null;
  }
  return `Antigravity run failed: ${lines[0]}`;
}

/**
 * Scans combined stdout/stderr for a freshly-minted conversation/session id reported by
 * the Antigravity CLI on a run that was not resuming an existing conversation.
 *
 * This is what makes multi-turn sessions possible: without it, every run looks like a
 * brand new conversation to the adapter, even though `agy` itself tracked one.
 *
 * @param stdout - The process stdout stream content.
 * @param stderr - The process stderr stream content.
 * @returns The extracted session id, or null if no recognizable id was reported.
 */
export function extractAntigravitySessionId(stdout: string, stderr: string): string | null {
  const lines = combineAndCleanLines(stdout, stderr);
  for (const line of lines) {
    const match = AGY_SESSION_ID_RE.exec(line);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}
