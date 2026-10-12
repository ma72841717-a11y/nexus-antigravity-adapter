import { afterEach, describe, expect, it, vi } from "vitest";
import pc from "picocolors";
import { printAntigravityStreamEvent } from "../../src/cli/format-event.js";

describe("CLI format-event stream printer", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  afterEach(() => {
    logSpy.mockClear();
  });

  it("silently ignores empty or whitespace-only lines", () => {
    printAntigravityStreamEvent("   ", false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("prints general streaming plain-text messages in green", () => {
    printAntigravityStreamEvent("This is a response from the agent.", false);
    expect(logSpy).toHaveBeenCalledWith(pc.green("This is a response from the agent."));
  });

  it("prints lines starting with 'error:' in red", () => {
    printAntigravityStreamEvent("error: Failed to write scratch script to disk", false);
    expect(logSpy).toHaveBeenCalledWith(pc.red("error: Failed to write scratch script to disk"));
  });

  it("prints lines starting with 'fatal:' in red", () => {
    printAntigravityStreamEvent("fatal: Agent crashed unexpectedly", false);
    expect(logSpy).toHaveBeenCalledWith(pc.red("fatal: Agent crashed unexpectedly"));
  });
});
