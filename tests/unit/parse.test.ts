import { describe, expect, it } from "vitest";
import {
  isAntigravityUnknownSessionError,
  detectAntigravityAuthRequired,
  detectAntigravityQuotaExhausted,
  isAntigravityTurnLimitResult,
  describeAntigravityFailure,
  extractAntigravitySessionId,
} from "../../src/server/parse.js";

describe("parse server helpers", () => {
  describe("isAntigravityUnknownSessionError", () => {
    it("detects unknown conversation error messages", () => {
      expect(isAntigravityUnknownSessionError("", "unknown conversation")).toBe(true);
      expect(isAntigravityUnknownSessionError("failed to resume conversation", "")).toBe(true);
      expect(isAntigravityUnknownSessionError("some other error", "")).toBe(false);
    });

    it("handles complex case-insensitive and spacing variations for unknown conversation errors", () => {
      expect(isAntigravityUnknownSessionError("", "UNKNOWN   CONVERSATION")).toBe(true);
      expect(isAntigravityUnknownSessionError("CONVERSATION  some-id-123   NOT   FOUND", "")).toBe(true);
      expect(isAntigravityUnknownSessionError("", "cannot\nresume\n")).toBe(true);
    });
  });

  describe("detectAntigravityAuthRequired", () => {
    it("detects when authentication is required", () => {
      expect(detectAntigravityAuthRequired({ stdout: "", stderr: "please authenticate first" })).toEqual({ requiresAuth: true });
      expect(detectAntigravityAuthRequired({ stdout: "not authenticated", stderr: "" })).toEqual({ requiresAuth: true });
      expect(detectAntigravityAuthRequired({ stdout: "success", stderr: "" })).toEqual({ requiresAuth: false });
    });

    it("matches advanced credential missing messages including key syntax and custom CLI run strings", () => {
      expect(detectAntigravityAuthRequired({ stdout: "", stderr: "api_key required" })).toEqual({ requiresAuth: true });
      expect(detectAntigravityAuthRequired({ stdout: "unauthorized request", stderr: "" })).toEqual({ requiresAuth: true });
      expect(detectAntigravityAuthRequired({ stdout: "", stderr: "please run `agy auth login` first" })).toEqual({ requiresAuth: true });
    });
  });

  describe("detectAntigravityQuotaExhausted", () => {
    it("detects quota errors", () => {
      expect(detectAntigravityQuotaExhausted({ stdout: "", stderr: "quota exceeded" })).toEqual({ exhausted: true });
      expect(detectAntigravityQuotaExhausted({ stdout: "resource_exhausted", stderr: "" })).toEqual({ exhausted: true });
      expect(detectAntigravityQuotaExhausted({ stdout: "normal text", stderr: "" })).toEqual({ exhausted: false });
    });

    it("matches rate limits, quota exhaustions and HTTP 429 errors", () => {
      expect(detectAntigravityQuotaExhausted({ stdout: "rate-limit exceeded", stderr: "" })).toEqual({ exhausted: true });
      expect(detectAntigravityQuotaExhausted({ stdout: "", stderr: "Error 429: Too Many Requests" })).toEqual({ exhausted: true });
      expect(detectAntigravityQuotaExhausted({ stdout: "please update your billing details", stderr: "" })).toEqual({ exhausted: true });
    });
  });

  describe("isAntigravityTurnLimitResult", () => {
    it("detects turn limit", () => {
      expect(isAntigravityTurnLimitResult(53, "")).toBe(true);
      expect(isAntigravityTurnLimitResult(0, "max_turns reached")).toBe(true);
      expect(isAntigravityTurnLimitResult(1, "some error")).toBe(false);
    });

    it("handles undefined or null exitCode and stderr boundaries gracefully", () => {
      expect(isAntigravityTurnLimitResult(undefined, "turn_limit_exceeded")).toBe(true);
      expect(isAntigravityTurnLimitResult(null, "Max turns hit")).toBe(false);
      expect(isAntigravityTurnLimitResult(null, undefined)).toBe(false);
      expect(isAntigravityTurnLimitResult(undefined, undefined)).toBe(false);
    });
  });

  describe("describeAntigravityFailure", () => {
    it("describes failures correctly", () => {
      expect(describeAntigravityFailure("stdout", "stderr error")).toBe("Antigravity run failed: stderr error");
      expect(describeAntigravityFailure("", "")).toBeNull();
    });

    it("filters out empty lines and returns the first meaningful failure line", () => {
      const complexStderr = "\n\n  \nActual error message here \nAnother trace line";
      expect(describeAntigravityFailure("", complexStderr)).toBe("Antigravity run failed: Actual error message here");
    });
  });

  // New in this fork: captures a freshly-minted conversation id so a new session can be
  // resumed on the *next* run. Upstream had no equivalent extraction at all.
  describe("extractAntigravitySessionId", () => {
    it("extracts a conversation id reported on stdout", () => {
      expect(extractAntigravitySessionId("Conversation ID: abc-123-def\n", "")).toBe("abc-123-def");
    });

    it("extracts a session id reported with an equals-sign form", () => {
      expect(extractAntigravitySessionId("", "session_id=xyz789token\n")).toBe("xyz789token");
    });

    it("extracts a JSON-style conversationId fragment", () => {
      expect(extractAntigravitySessionId('{"conversationId": "json-id-001"}', "")).toBe("json-id-001");
    });

    it("is case-insensitive and tolerant of a conv shorthand", () => {
      expect(extractAntigravitySessionId("", "CONV ID: shorthand-id-9")).toBe("shorthand-id-9");
    });

    it("returns null when no recognizable id is present", () => {
      expect(extractAntigravitySessionId("plain response with no ids", "")).toBeNull();
      expect(extractAntigravitySessionId("", "")).toBeNull();
    });

    it("does not confuse an unrelated numeric id-looking token for a session id", () => {
      expect(extractAntigravitySessionId("request id: 42", "")).toBeNull();
    });
  });
});
