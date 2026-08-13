import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const db = vi.hoisted(() => ({
  addTerminalEvent: vi.fn(),
  chooseLeastLoadedInstance: vi.fn(),
  createInstance: vi.fn(),
  createTerminalSession: vi.fn(),
  getInstanceForUser: vi.fn(),
  getSessionForUser: vi.fn(),
  incrementActiveSessions: vi.fn(),
  listInstancesForUser: vi.fn(),
  listSessionsForInstance: vi.fn(),
  listTerminalEvents: vi.fn(),
  markStaleInstancesOffline: vi.fn(),
  orderTerminalEvents: vi.fn((events: Array<{ id: number }>) => [...events].sort((left, right) => left.id - right.id)),
  removeInstance: vi.fn(),
  updateInstance: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("./db", () => db);

import { encryptSecret } from "./crypto";
import { controllerRouter } from "./routers";

const user = {
  id: 7,
  openId: "controller-user",
  email: "controller@example.com",
  name: "Controller User",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function caller() {
  return controllerRouter.createCaller({
    user,
    req: { protocol: "https", get: (name: string) => name === "host" ? "controller.example.com" : undefined },
    res: {},
  } as unknown as TrpcContext);
}

const onlineInstance = {
  id: 11,
  createdBy: user.id,
  name: "Production agent",
  instanceUrl: "https://agent.example.com",
  status: "online" as const,
  enrollmentTokenHash: "hash",
  agentTokenHash: "agent-hash",
  agentTokenCiphertext: "",
  cpuPercent: 12,
  memoryPercent: 18,
  memoryTotalMb: 1024,
  activeSessions: 0,
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("controller instance and session procedures", () => {
  beforeEach(() => {
    process.env.INSTANCE_CREDENTIAL_KEY = "terminal-kit-router-test-key";
    onlineInstance.agentTokenCiphertext = encryptSecret("agent-token");
    Object.values(db).forEach(mock => mock.mockReset());
    db.orderTerminalEvents.mockImplementation((events: Array<{ id: number }>) => [...events].sort((left, right) => left.id - right.id));
    db.markStaleInstancesOffline.mockResolvedValue(undefined);
    db.updateSession.mockResolvedValue(undefined);
    db.incrementActiveSessions.mockResolvedValue(undefined);
    db.addTerminalEvent.mockResolvedValue({ createdAt: new Date() });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  });

  it("lists registered instances for the authenticated controller user", async () => {
    db.listInstancesForUser.mockResolvedValue([onlineInstance]);
    await expect(caller().instances.list()).resolves.toEqual([onlineInstance]);
    expect(db.markStaleInstancesOffline).toHaveBeenCalledOnce();
    expect(db.listInstancesForUser).toHaveBeenCalledWith(user.id);
  });

  it("registers a named HTTP(S) instance and sends its Dockerfile communication protocol", async () => {
    const pending = { ...onlineInstance, id: 12, name: "Staging agent", status: "pending" as const };
    db.createInstance.mockResolvedValue(pending);
    const result = await caller().instances.register({ name: "Staging agent", instanceUrl: "https://staging.example.com/" });
    expect(db.createInstance).toHaveBeenCalledWith(expect.objectContaining({ createdBy: user.id, name: "Staging agent", instanceUrl: "https://staging.example.com" }));
    expect(fetch).toHaveBeenCalledWith("https://staging.example.com/v1/terminal-kit/bootstrap", expect.objectContaining({ method: "POST" }));
    expect(result.deliveryStatus).toBe("sent");
    expect(result.dockerfile).toContain("TERMINAL_KIT_PROTOCOL_VERSION=1");
  });

  it("uses the selected instance when requested and keeps active-session accounting ordered", async () => {
    db.getInstanceForUser.mockResolvedValue(onlineInstance);
    db.createTerminalSession.mockResolvedValue({ id: "session-selected" });
    const result = await caller().sessions.create({ command: "printf ok", instanceId: onlineInstance.id });
    expect(result).toMatchObject({ sessionId: "session-selected", instanceId: onlineInstance.id, route: "selected instance" });
    expect(db.chooseLeastLoadedInstance).not.toHaveBeenCalled();
    expect(db.updateSession.mock.invocationCallOrder[0]).toBeLessThan(db.incrementActiveSessions.mock.invocationCallOrder[0]);
    expect(db.incrementActiveSessions.mock.calls).toEqual([[onlineInstance.id, 1]]);
  });

  it("uses least-loaded routing when no instance is selected", async () => {
    db.chooseLeastLoadedInstance.mockResolvedValue(onlineInstance);
    db.createTerminalSession.mockResolvedValue({ id: "session-balanced" });
    const result = await caller().sessions.create({ command: "printf ok" });
    expect(result.route).toBe("least-loaded instance");
    expect(db.chooseLeastLoadedInstance).toHaveBeenCalledWith(user.id);
  });

  it("decrements active-session accounting when agent command dispatch fails", async () => {
    db.getInstanceForUser.mockResolvedValue(onlineInstance);
    db.createTerminalSession.mockResolvedValue({ id: "session-failed" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    await expect(caller().sessions.create({ command: "printf fail", instanceId: onlineInstance.id })).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    expect(db.incrementActiveSessions.mock.calls).toEqual([[onlineInstance.id, 1], [onlineInstance.id, -1]]);
    expect(db.updateSession).toHaveBeenLastCalledWith("session-failed", expect.objectContaining({ state: "failed", exitCode: 1 }));
  });

  it("returns persisted terminal history in ascending commit order", async () => {
    db.getSessionForUser.mockResolvedValue({ id: "session-history", instanceId: onlineInstance.id, createdBy: user.id });
    const events = [{ id: 5, sequence: 1, payload: "second committed" }, { id: 4, sequence: 2, payload: "first committed" }];
    db.listTerminalEvents.mockResolvedValue(events);
    await expect(caller().sessions.history({ sessionId: "session-history" })).resolves.toEqual({ session: expect.objectContaining({ id: "session-history" }), events: [events[1], events[0]] });
    expect(db.listTerminalEvents).toHaveBeenCalledWith("session-history");
  });
});
