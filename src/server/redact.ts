/**
 * @fileoverview Single shared sanitization path for anything derived from raw `agy` CLI
 * stdout/stderr before it is placed into a thrown error, a returned error message, or any
 * other adapter-result field visible to callers.
 *
 * New in this fork: upstream (and this fork prior to this fix) returned `fallbackErrorMessage`
 * and `resultJson.raw` built directly from raw CLI output with no redaction, so a CLI that
 * echoed credential material (e.g. an injected auth token) back on failure — intentionally
 * or via a misbehaving/compromised binary — would leak it straight through to the caller.
 *
 * @license MIT
 */

/**
 * Replaces every occurrence of each known secret value with a fixed placeholder.
 * Secrets shorter than 4 characters are ignored to avoid pathological over-redaction of
 * incidental short substrings.
 */
export function redactSecrets(text: string, secrets: Array<string | null | undefined>): string {
  let result = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4 && result.includes(secret)) {
      result = result.split(secret).join("[REDACTED]");
    }
  }
  return result;
}
