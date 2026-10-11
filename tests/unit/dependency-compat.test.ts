import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function packageJson(relativePath: string): { version?: string; dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

describe("adapter-utils dependency compatibility", () => {
  it("typechecks against the exact adapter-utils version declared by this package", () => {
    const declared = packageJson("../../package.json").dependencies?.["@paperclipai/adapter-utils"];
    const installed = packageJson("../../node_modules/@paperclipai/adapter-utils/package.json").version;
    expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
    expect(installed).toBe(declared);
  });
});
