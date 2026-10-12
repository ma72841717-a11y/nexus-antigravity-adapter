/**
 * @fileoverview Generic string/argument helpers shared across the adapter.
 *
 * Vendored unchanged (no security-relevant behavior) from
 * `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2`. See docs/UPSTREAM_PROVENANCE.md.
 *
 * @copyright Antigravity Adapter Contributors
 * @license MIT
 */

/**
 * Type guard that asserts whether an unknown value is a valid, non-empty string.
 * Automatically trims the value before performing the length check.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Splits a text block by line breaks (`\n` or `\r\n`), trims each individual line,
 * and filters out any completely empty lines.
 */
export function parseMultilineLines(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Safely retrieves the first populated (non-empty) line from a text block.
 */
export function firstNonEmptyLine(text: string): string {
  return parseMultilineLines(text)[0] ?? "";
}

/**
 * Splits a comma-separated arguments string into a structured array of clean,
 * non-empty strings.
 */
export function parseCommaArgs(value: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Validates in an OS-agnostic manner whether an executable command or PATH matches
 * the expected binary name. Handles Windows extensions (`.exe` and `.cmd`) automatically.
 */
export function commandLooksLike(command: string, expected: string): boolean {
  if (!command) return false;
  const base = command.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const expectedLower = expected.toLowerCase();
  return base === expectedLower || base === `${expectedLower}.cmd` || base === `${expectedLower}.exe`;
}
