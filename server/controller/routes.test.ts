import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  addTerminalEvent: vi.fn(),
  getInstanceByAgentHash: vi.fn(),
  getInstanceByEnrollmentHash: vi.fn(),
  getSessionById: vi.fn(),
  getSessionForUser: vi.fn(),
  incrementActiveSessions: vi.fn(),
  listTerminalEvents: vi.fn(),
  updateInstance: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("./db", () => db);
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

import { decryptSecret, hashSecret } from "./crypto";
import { registerControllerRoutes } from "./routes";

describe("agent enrollment route", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    process.env.INSTANCE_CREDENTIAL_KEY = "terminal-kit-enrollment-test-key";
    Object.values(db).forEach(mock => mock.mockReset());
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

  it("enrolls a valid pending instance and persists a hashed, encrypted agent credential", async () => {
    db.getInstanceByEnrollmentHash.mockResolvedValue({ id: 22, name: "Render agent", status: "pending", instanceUrl: "https://old.example.com" });
    const response = await fetch(`${baseUrl}/api/agent/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceName: "Render agent", enrollmentToken: "one-time-token", instanceUrl: "https://agent.onrender.com" }),
    });
    const payload = await response.json() as { instanceId: number; agentToken: string };
    expect(response.status).toBe(201);
    expect(payload.instanceId).toBe(22);
    const persisted = db.updateInstance.mock.calls[0][1];
    expect(persisted.status).toBe("online");
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
});
