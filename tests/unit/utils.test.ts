import { describe, expect, it } from "vitest";
import {
  isNonEmptyString,
  parseMultilineLines,
  firstNonEmptyLine,
  parseCommaArgs,
  commandLooksLike,
} from "../../src/utils.js";

describe("global utilities", () => {
  describe("isNonEmptyString", () => {
    it("should identify valid non-empty strings", () => {
      expect(isNonEmptyString("hello")).toBe(true);
      expect(isNonEmptyString("  trimmed  ")).toBe(true);
      expect(isNonEmptyString("a")).toBe(true);
    });

    it("should identify invalid or empty inputs", () => {
      expect(isNonEmptyString("")).toBe(false);
      expect(isNonEmptyString("   ")).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
    });
  });

  describe("parseMultilineLines", () => {
    it("should split, trim, and filter out empty lines", () => {
      const text = "  line 1  \n\n   line 2 \r\n  \n\tline 3";
      expect(parseMultilineLines(text)).toEqual(["line 1", "line 2", "line 3"]);
    });

    it("should return empty array for empty, whitespace, or falsy inputs", () => {
      expect(parseMultilineLines("")).toEqual([]);
      expect(parseMultilineLines("   ")).toEqual([]);
      expect(parseMultilineLines(null as unknown as string)).toEqual([]);
    });
  });

  describe("firstNonEmptyLine", () => {
    it("should retrieve the first non-empty line", () => {
      const text = "\n\n  first line  \n second line";
      expect(firstNonEmptyLine(text)).toBe("first line");
    });

    it("should return empty string if no line is populated", () => {
      expect(firstNonEmptyLine("   \n\n")).toBe("");
      expect(firstNonEmptyLine("")).toBe("");
    });
  });

  describe("parseCommaArgs", () => {
    it("should split by comma and clean values", () => {
      const args = " arg1 ,   , arg2 , --flag=value ";
      expect(parseCommaArgs(args)).toEqual(["arg1", "arg2", "--flag=value"]);
    });

    it("should return empty array for empty inputs or commas-only", () => {
      expect(parseCommaArgs("")).toEqual([]);
      expect(parseCommaArgs("  ,, ,  , ")).toEqual([]);
    });
  });

  describe("commandLooksLike", () => {
    it("should match command name correctly ignoring directory paths", () => {
      expect(commandLooksLike("/usr/local/bin/agy", "agy")).toBe(true);
      expect(commandLooksLike("C:\\Program Files\\agy.exe", "agy")).toBe(true);
      expect(commandLooksLike("agy.cmd", "agy")).toBe(true);
    });

    it("should be case-insensitive to commands and Windows extensions", () => {
      expect(commandLooksLike("/path/to/AGY.EXE", "agy")).toBe(true);
      expect(commandLooksLike("AGY", "agy")).toBe(true);
    });

    it("should fail for mismatched commands", () => {
      expect(commandLooksLike("gemini", "agy")).toBe(false);
      expect(commandLooksLike("", "agy")).toBe(false);
    });
  });
});
