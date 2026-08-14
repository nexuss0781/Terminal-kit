import { describe, expect, it } from "vitest";
import { generateAgentDockerfile } from "./dockerfile";
import { TERMINAL_KIT_PROTOCOL_VERSION } from "./protocol";

describe("Dockerfile communication protocol", () => {
  it("embeds the controller enrollment details and interactive terminal agent", () => {
    const dockerfile = generateAgentDockerfile({
      controllerUrl: "https://controller.example.com/",
      enrollmentToken: "one-time-enrollment-token",
    });
    expect(dockerfile).toContain(TERMINAL_KIT_PROTOCOL_VERSION);
    expect(dockerfile).toContain("CONTROLLER_URL=\"https://controller.example.com\"");
    expect(dockerfile).toContain("RENDER_EXTERNAL_URL");
    expect(dockerfile).toContain("statfs");
    expect(dockerfile).not.toContain("INSTANCE_NAME=");
    expect(dockerfile).toContain("one-time-enrollment-token");
    expect(dockerfile).toContain("/v1/terminal-kit/bootstrap");
    expect(dockerfile).toContain('spawn("script"');
    expect(dockerfile).toContain("/stdin");
  });
});
