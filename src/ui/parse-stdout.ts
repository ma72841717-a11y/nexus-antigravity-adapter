/**
 * @fileoverview Stdout stream line parser mapping CLI print messages into UI transcripts.
 *
 * Vendored unchanged (no security-relevant behavior) from
 * `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2`. See docs/UPSTREAM_PROVENANCE.md.
 *
 * @copyright Antigravity Adapter Contributors
 * @license MIT
 */

import type { TranscriptEntry } from "@paperclipai/adapter-utils";

/**
 * Parses a single line of stdout captured during process executions.
 */
export function parseAntigravityStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const text = line.trim();

  if (!text) {
    return [];
  }

  const lowerText = text.toLowerCase();
  if (lowerText.startsWith("error:") || lowerText.startsWith("fatal:")) {
    return [{ kind: "stderr", ts, text }];
  }

  return [{ kind: "assistant", ts, text }];
}
