import { describe, expect, it } from "vitest";
import { generateAgentDockerfile } from "./dockerfile";
import { TERMINAL_KIT_PROTOCOL_VERSION } from "./protocol";

describe("Dockerfile communication protocol", () => {
  it("embeds the controller enrollment details and interactive terminal agent", () => {
    const dockerfile = generateAgentDockerfile({
      controllerUrl: "https://controller.example.com/",
      instanceName: "agent-01",
      enrollmentToken: "one-time-enrollment-token",
    });
    expect(dockerfile).toContain(TERMINAL_KIT_PROTOCOL_VERSION);
    expect(dockerfile).toContain("CONTROLLER_URL=\"https://controller.example.com\"");
    expect(dockerfile).toContain("INSTANCE_NAME=\"agent-01\"");
    expect(dockerfile).toContain("one-time-enrollment-token");
    expect(dockerfile).toContain("/v1/terminal-kit/bootstrap");
    expect(dockerfile).toContain('spawn("script"');
    expect(dockerfile).toContain("/stdin");
  });
});
