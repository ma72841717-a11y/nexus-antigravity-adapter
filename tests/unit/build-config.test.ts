import { describe, expect, it } from "vitest";
import { buildAntigravityLocalConfig } from "../../src/ui/build-config.js";
import { DEFAULT_ANTIGRAVITY_LOCAL_MODEL } from "../../src/index.js";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";

describe("UI build-config mapper", () => {
  it("builds the configuration with safe-by-default values when provided with minimal parameters", () => {
    const result = buildAntigravityLocalConfig({} as CreateConfigValues);

    expect(result).toEqual({
      model: DEFAULT_ANTIGRAVITY_LOCAL_MODEL,
      timeoutSec: 0,
      graceSec: 15,
      sandbox: true,
      dangerouslySkipPermissions: false,
    });
  });

  it("maps cwd, instructionsFilePath, and custom command properties directly", () => {
    const result = buildAntigravityLocalConfig({
      cwd: "/home/developer/workspace",
      instructionsFilePath: "/home/developer/instructions.md",
      command: "/usr/bin/agy-custom",
    } as CreateConfigValues);

    expect(result.cwd).toBe("/home/developer/workspace");
    expect(result.instructionsFilePath).toBe("/home/developer/instructions.md");
    expect(result.command).toBe("/usr/bin/agy-custom");
  });

  it("correctly parses legacy plain text envVars variables", () => {
    const envVars = `
      # A comment line to skip
      PORT=8080
      HOST=127.0.0.1
      1INVALID=should-be-ignored
      VALID_VAR=hello=world
    `;

    const result = buildAntigravityLocalConfig({ envVars } as CreateConfigValues);

    expect(result.env).toEqual({
      PORT: { type: "plain", value: "8080" },
      HOST: { type: "plain", value: "127.0.0.1" },
      VALID_VAR: { type: "plain", value: "hello=world" },
    });
  });

  it("parses structured envBindings plain text and secret_ref references", () => {
    const envBindings = {
      API_KEY: "plain-text-key",
      DB_PASSWORD: { type: "secret_ref", secretId: "sec-db-pass", version: "latest" },
      API_PORT: { type: "plain", value: "3000" },
      INVALID_BINDING: { type: "invalid_type", value: "ignored" },
    };

    const result = buildAntigravityLocalConfig({ envBindings } as unknown as CreateConfigValues);

    expect(result.env).toEqual({
      API_KEY: { type: "plain", value: "plain-text-key" },
      DB_PASSWORD: { type: "secret_ref", secretId: "sec-db-pass", version: "latest" },
      API_PORT: { type: "plain", value: "3000" },
    });
  });

  it("resolves key collisions by prioritizing envBindings over legacy envVars", () => {
    const envVars = `
      PORT=8080
      TIMEOUT=30
    `;
    const envBindings = { PORT: "9000", ENV_NAME: "production" };

    const result = buildAntigravityLocalConfig({ envVars, envBindings } as unknown as CreateConfigValues);

    expect(result.env).toEqual({
      PORT: { type: "plain", value: "9000" },
      TIMEOUT: { type: "plain", value: "30" },
      ENV_NAME: { type: "plain", value: "production" },
    });
  });

  it("correctly triggers sandbox flag based on dangerouslyBypassSandbox UI values", () => {
    const withSandbox = buildAntigravityLocalConfig({ dangerouslyBypassSandbox: false } as CreateConfigValues);
    expect(withSandbox.sandbox).toBe(true);

    const bypassed = buildAntigravityLocalConfig({ dangerouslyBypassSandbox: true } as CreateConfigValues);
    expect(bypassed.sandbox).toBe(false);
  });

  // This is the core fork fix: upstream never read this field at all, so the standard
  // Paperclip "dangerously skip permissions" checkbox had zero effect for this adapter,
  // while execute.ts's argument builder appended the flag unconditionally regardless.
  it("wires the standard dangerouslySkipPermissions UI toggle through, defaulting to false", () => {
    const defaulted = buildAntigravityLocalConfig({} as CreateConfigValues);
    expect(defaulted.dangerouslySkipPermissions).toBe(false);

    const explicitFalse = buildAntigravityLocalConfig({ dangerouslySkipPermissions: false } as CreateConfigValues);
    expect(explicitFalse.dangerouslySkipPermissions).toBe(false);

    const explicitTrue = buildAntigravityLocalConfig({ dangerouslySkipPermissions: true } as CreateConfigValues);
    expect(explicitTrue.dangerouslySkipPermissions).toBe(true);
  });

  it("parses comma-separated extraArgs into an array list of string arguments", () => {
    const result = buildAntigravityLocalConfig({
      extraArgs: "--verbose, --debug, --model-fallback=none",
    } as CreateConfigValues);

    expect(result.extraArgs).toEqual(["--verbose", "--debug", "--model-fallback=none"]);
  });
});
