import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  addTerminalEvent: vi.fn(),
  createInstance: vi.fn(),
  getInstanceByAgentHash: vi.fn(),
  getInstanceByEnrollmentHash: vi.fn(),
  getInstanceByUrl: vi.fn(),
  getSessionById: vi.fn(),
  getSessionForUser: vi.fn(),
  incrementActiveSessions: vi.fn(),
  listTerminalEvents: vi.fn(),
  updateInstance: vi.fn(),
  updateSession: vi.fn(),
}));
const owner = vi.hoisted(() => ({ getControllerServiceOwner: vi.fn() }));

vi.mock("./db", () => db);
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("./serviceOwner", () => owner);

import { decryptSecret, hashSecret } from "./crypto";
import { registerControllerRoutes } from "./routes";

describe("agent enrollment route", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    process.env.INSTANCE_CREDENTIAL_KEY = "terminal-kit-enrollment-test-key";
    Object.values(db).forEach(mock => mock.mockReset());
    owner.getControllerServiceOwner.mockReset();
    owner.getControllerServiceOwner.mockResolvedValue({ id: 7 });
    const app = express();
    app.use(express.json());
    registerControllerRoutes(app);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("self-enrolls a valid pending instance and persists its endpoint, automatic name, inventory, and encrypted agent credential", async () => {
    db.getInstanceByEnrollmentHash.mockResolvedValue({ id: 22, name: "Pending agent 22", status: "pending", instanceUrl: "pending://22" });
    const response = await fetch(`${baseUrl}/api/agent/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enrollmentToken: "one-time-token", instanceUrl: "https://agent.onrender.com", hostname: "render-worker", agentVersion: "2.0.0", osPlatform: "linux", architecture: "x64", cpuCount: 2, cpuPercent: 12, memoryPercent: 45, memoryTotalMb: 4096, diskPercent: 35, diskTotalMb: 20_480, diskFreeMb: 13_312 }),
    });
    const payload = await response.json() as { instanceId: number; agentToken: string };
    expect(response.status).toBe(201);
    expect(payload.instanceId).toBe(22);
    const persisted = db.updateInstance.mock.calls[0][1];
    expect(persisted.status).toBe("online");
    expect(persisted.name).toBe("render-worker");
    expect(persisted.instanceUrl).toBe("https://agent.onrender.com");
    expect(persisted).toMatchObject({ hostname: "render-worker", agentVersion: "2.0.0", osPlatform: "linux", architecture: "x64", cpuCount: 2, memoryTotalMb: 4096, diskTotalMb: 20_480, diskFreeMb: 13_312 });
    expect(persisted.agentTokenHash).toBe(hashSecret(payload.agentToken));
    expect(decryptSecret(persisted.agentTokenCiphertext)).toBe(payload.agentToken);
  });

  it("rejects an invalid enrollment token", async () => {
    db.getInstanceByEnrollmentHash.mockResolvedValue(undefined);
    const response = await fetch(`${baseUrl}/api/agent/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceName: "Unknown", enrollmentToken: "wrong" }),
    });
    expect(response.status).toBe(401);
    expect(db.updateInstance).not.toHaveBeenCalled();
  });

  it("automatically registers a Render agent after it proves control of its own endpoint", async () => {
    const originalFetch = globalThis.fetch;
    const bootstrapSecret = "a".repeat(43);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://worker.onrender.com/v1/terminal-kit/bootstrap") {
        expect(init?.headers).toMatchObject({ "x-terminal-kit-bootstrap": bootstrapSecret });
        return new Response(JSON.stringify({ accepted: true }), { status: 202 });
      }
      return originalFetch(input, init);
    }));
    db.getInstanceByUrl.mockResolvedValue(undefined);
    db.createInstance.mockResolvedValue({ id: 81 });

    const response = await originalFetch(`${baseUrl}/api/agent/auto-enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bootstrapSecret, instanceUrl: "https://worker.onrender.com", hostname: "worker", cpuCount: 4, memoryTotalMb: 8192, diskTotalMb: 32_000 }),
    });
    const payload = await response.json() as { instanceId: number; agentToken: string };
    expect(response.status).toBe(201);
    expect(payload.instanceId).toBe(81);
    expect(db.createInstance).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 7, name: "Terminal agent worker", instanceUrl: "https://worker.onrender.com" }));
    expect(db.updateInstance).toHaveBeenCalledWith(81, expect.objectContaining({ status: "online", agentTokenHash: hashSecret(payload.agentToken), hostname: "worker" }));
    vi.unstubAllGlobals();
  });
});
