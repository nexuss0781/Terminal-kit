import { describe, expect, it } from "vitest";
import { isTerminalOutputKind, normalizeInstanceUrl } from "./protocol";

describe("instance communication protocol", () => {
  it("normalizes valid instance URLs and rejects unsafe protocols", () => {
    expect(normalizeInstanceUrl("https://agent.example.com/")).toBe("https://agent.example.com");
    expect(() => normalizeInstanceUrl("file:///etc/passwd")).toThrow("HTTP or HTTPS");
  });

  it("accepts only terminal stdout and stderr callback kinds", () => {
    expect(isTerminalOutputKind("stdout")).toBe(true);
    expect(isTerminalOutputKind("stderr")).toBe(true);
    expect(isTerminalOutputKind("stdin")).toBe(false);
  });
});
