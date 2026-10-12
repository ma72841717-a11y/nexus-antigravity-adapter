import { describe, expect, it } from "vitest";
import { sessionCodec, parseSessionParams } from "../../src/server/index.js";

describe("session codec and params parser", () => {
  describe("parseSessionParams", () => {
    it("successfully parses valid session parameters with exact camelCase structure", () => {
      const input = {
        sessionId: "session-123",
        cwd: "/home/developer/workspace",
        workspaceId: "ws-abc",
        repoUrl: "git@github.com:example/project.git",
        repoRef: "main",
      };

      expect(parseSessionParams(input)).toEqual(input);
    });

    it("resolves parameters through snake_case and historical keys fallbacks", () => {
      const input = {
        session_id: "session-456",
        workdir: "/var/tmp/project",
        workspace_id: "ws-xyz",
        repo_url: "git@github.com:example/another.git",
        repo_ref: "dev",
      };

      expect(parseSessionParams(input)).toEqual({
        sessionId: "session-456",
        cwd: "/var/tmp/project",
        workspaceId: "ws-xyz",
        repoUrl: "git@github.com:example/another.git",
        repoRef: "dev",
      });
    });

    it("returns null if sessionId and its fallbacks are absent", () => {
      expect(parseSessionParams({ cwd: "/var/tmp/project" })).toBeNull();
    });

    it("filters out empty or non-string parameters", () => {
      const input = {
        sessionId: "session-valid",
        cwd: "  ",
        workspaceId: 1234,
        repoUrl: null,
      };

      expect(parseSessionParams(input as unknown as Record<string, unknown>)).toEqual({
        sessionId: "session-valid",
      });
    });
  });

  describe("sessionCodec", () => {
    it("deserializes valid session object inputs", () => {
      const result = sessionCodec.deserialize({ sessionId: "session-ok", folder: "/project" });
      expect(result).toEqual({ sessionId: "session-ok", cwd: "/project" });
    });

    it("deserializes invalid, array, or null inputs to null", () => {
      expect(sessionCodec.deserialize(null)).toBeNull();
      expect(sessionCodec.deserialize([])).toBeNull();
      expect(sessionCodec.deserialize("just-a-string")).toBeNull();
    });

    it("serializes valid session params", () => {
      const result = sessionCodec.serialize({ sessionId: "session-ok", cwd: "/project" });
      expect(result).toEqual({ sessionId: "session-ok", cwd: "/project" });
    });

    it("serializes null or missing sessionId records to null", () => {
      expect(sessionCodec.serialize(null)).toBeNull();
      expect(sessionCodec.serialize({ cwd: "/project" })).toBeNull();
    });

    it("gets the display ID correctly", () => {
      expect(sessionCodec.getDisplayId(null)).toBeNull();
      expect(sessionCodec.getDisplayId({ sessionId: "disp-1" })).toBe("disp-1");
      expect(sessionCodec.getDisplayId({ session_id: "disp-2" })).toBe("disp-2");
      expect(sessionCodec.getDisplayId({ sessionID: "disp-3" })).toBe("disp-3");
    });
  });
});
