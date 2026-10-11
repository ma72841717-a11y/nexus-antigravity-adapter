/**
 * @fileoverview Stream event formatter for the Antigravity local CLI execution.
 * Intercepts stdout chunks and outputs formatted messages with custom colors in the terminal.
 *
 * Vendored unchanged (no security-relevant behavior) from
 * `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2`. See docs/UPSTREAM_PROVENANCE.md.
 *
 * @copyright Antigravity Adapter Contributors
 * @license MIT
 */

import pc from "picocolors";

/**
 * Formats and prints streaming event logs received from the running Antigravity process.
 */
export function printAntigravityStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) {
    return;
  }

  const lowerLine = line.toLowerCase();
  if (lowerLine.startsWith("error:") || lowerLine.startsWith("fatal:")) {
    console.log(pc.red(line));
    return;
  }

  console.log(pc.green(line));
}
