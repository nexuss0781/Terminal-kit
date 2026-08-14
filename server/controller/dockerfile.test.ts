import { describe, expect, it } from "vitest";
import { generateAgentDockerfile } from "./dockerfile";
import { TERMINAL_KIT_PROTOCOL_VERSION } from "./protocol";

describe("Dockerfile communication protocol", () => {
  it("builds a zero-configuration agent that obtains its protocol source from the public client repository", () => {
    const dockerfile = generateAgentDockerfile();
    expect(dockerfile).toContain(TERMINAL_KIT_PROTOCOL_VERSION);
    expect(dockerfile).toContain("https://raw.githubusercontent.com/nexuss0781/terminalkit-docker/main/agent.mjs");
    expect(dockerfile).not.toContain("ENROLLMENT_TOKEN");
    expect(dockerfile).not.toContain("CONTROLLER_URL=");
    expect(dockerfile).toContain('CMD ["node", "/app/agent.mjs"]');
  });
});
