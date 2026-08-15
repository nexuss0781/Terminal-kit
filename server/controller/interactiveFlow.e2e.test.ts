import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  addTerminalEvent: vi.fn(),
  choosePreferredInstanceGlobal: vi.fn(),
  createInstance: vi.fn(),
  createTerminalSession: vi.fn(),
  getInstanceByAgentHash: vi.fn(),
  getInstanceByEnrollmentHash: vi.fn(),
  getInstanceById: vi.fn(),
  getInstanceByUrl: vi.fn(),
  getSessionById: vi.fn(),
  incrementActiveSessions: vi.fn(),
  listAllInstances: vi.fn(),
  listSessionsForInstanceAdmin: vi.fn(),
  listTerminalEvents: vi.fn(),
  removeInstanceById: vi.fn(),
  updateInstance: vi.fn(),
  updateSession: vi.fn(),
}));
const crypto = vi.hoisted(() => ({
  createSecret: vi.fn(() => "generated-secret"),
  decryptSecret: vi.fn(() => "agent-token"),
  encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
  hashSecret: vi.fn((value: string) => `hash:${value}`),
}));
const owner = vi.hoisted(() => ({ getControllerServiceOwner: vi.fn() }));

vi.mock("./db", () => db);
vi.mock("./crypto", () => crypto);
vi.mock("./serviceOwner", () => owner);

import { registerAdminControlRoutes } from "./adminControlRoutes";
import { registerAdminRoutes } from "./adminRoutes";
import { registerPublicControllerApi } from "./publicApi";
import { registerControllerRoutes } from "./routes";

describe("interactive terminal flow end to end", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";
  let nativeFetch: typeof fetch;
  let events: Array<{ id: number; sessionId: string; sequence: number; kind: "stdout" | "stderr" | "stdin" | "status"; payload: string; createdAt: Date }>;
  const session = { id: "interactive-session", instanceId: 11, createdBy: 1, command: "", state: "queued", exitCode: null as number | null, createdAt: new Date(), updatedAt: new Date(), startedAt: null as Date | null, completedAt: null as Date | null };
  const instance = { id: 11, createdBy: 1, name: "Interactive agent", instanceUrl: "https://agent.example.com", status: "online" as const, availability: "active" as const, agentTokenCiphertext: "encrypted:agent-token", agentTokenHash: "hash:agent-token", enrollmentTokenHash: "bootstrap", cpuCount: 2, cpuPercent: 10, memoryPercent: 20, memoryTotalMb: 2048, diskPercent: 10, diskTotalMb: 10_000, diskFreeMb: 9_000, activeSessions: 0, lastSeenAt: new Date(), createdAt: new Date(), updatedAt: new Date() };

  beforeEach(async () => {
    process.env.CONTROLLER_API_KEY = "interactive-controller-key";
    process.env.ADMIN_PASSWORD = "interactive-admin-password";
    events = [];
    session.command = "";
    session.state = "queued";
    session.exitCode = null;
    session.startedAt = null;
    session.completedAt = null;
    Object.values(db).forEach(mock => mock.mockReset());
    Object.values(crypto).forEach(mock => mock.mockClear());
    owner.getControllerServiceOwner.mockResolvedValue({ id: 1 });
    db.getInstanceById.mockResolvedValue(instance);
    db.getInstanceByAgentHash.mockResolvedValue(instance);
    db.createTerminalSession.mockImplementation(async values => {
      session.command = values.command;
      return session;
    });
    db.getSessionById.mockImplementation(async id => id === session.id ? session : undefined);
    db.updateSession.mockImplementation(async (_id, values) => Object.assign(session, values, { updatedAt: new Date() }));
    db.incrementActiveSessions.mockResolvedValue(undefined);
    db.listTerminalEvents.mockImplementation(async () => events);
    db.listSessionsForInstanceAdmin.mockResolvedValue([session]);
    db.addTerminalEvent.mockImplementation(async values => {
      const event = { id: events.length + 1, ...values, createdAt: new Date() };
      events.push(event);
      return event;
    });
    nativeFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://agent.example.com/")) return Promise.resolve(new Response(null, { status: 202 }));
      return nativeFetch(input, init);
    }));
    const app = express();
    app.use(express.json());
    registerAdminRoutes(app);
    registerAdminControlRoutes(app);
    registerPublicControllerApi(app);
    registerControllerRoutes(app);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("accepts multiple stdin entries one by one, streams each state, persists every event, and exposes the complete transaction to administrators", async () => {
    const headers = { authorization: "Bearer interactive-controller-key", "content-type": "application/json" };
    const command = "printf 'PROMPT: first value'; read first; printf 'FIRST:%s\\nPROMPT: second value' \"$first\"; read second; printf 'SECOND:%s\\n' \"$second\"";

    const dispatch = await nativeFetch(`${baseUrl}/api/v1/commands`, { method: "POST", headers, body: JSON.stringify({ instanceId: instance.id, command }) });
    expect(dispatch.status).toBe(202);
    await expect(dispatch.json()).resolves.toMatchObject({ data: { sessionId: session.id, instanceId: instance.id, route: "selected instance" } });
    expect(session.state).toBe("running");
    expect(events).toMatchObject([{ kind: "status", payload: "Running", sequence: 0 }]);

    const streamAbort = new AbortController();
    const stream = await nativeFetch(`${baseUrl}/api/v1/sessions/${session.id}/stream`, { headers: { authorization: "Bearer interactive-controller-key" }, signal: streamAbort.signal });
    const reader = stream.body?.getReader();
    expect(reader).toBeDefined();
    const firstStreamChunk = new TextDecoder().decode((await reader!.read()).value);
    expect(firstStreamChunk).toContain('"payload":"Running"');

    const agentHeaders = { authorization: "Bearer agent-token", "content-type": "application/json" };
    await expect(nativeFetch(`${baseUrl}/api/agent/sessions/${session.id}/events`, { method: "POST", headers: agentHeaders, body: JSON.stringify({ sequence: 1, kind: "stdout", payload: "PROMPT: first value" }) }).then(response => response.status)).resolves.toBe(202);
    const promptChunk = new TextDecoder().decode((await reader!.read()).value);
    expect(promptChunk).toContain("PROMPT: first value");

    const firstInput = await nativeFetch(`${baseUrl}/api/v1/sessions/${session.id}/stdin`, { method: "POST", headers, body: JSON.stringify({ input: "alpha\n" }) });
    expect(firstInput.status).toBe(202);
    await expect(nativeFetch(`${baseUrl}/api/agent/sessions/${session.id}/events`, { method: "POST", headers: agentHeaders, body: JSON.stringify({ sequence: 2, kind: "stdout", payload: "FIRST:alpha\nPROMPT: second value" }) }).then(response => response.status)).resolves.toBe(202);

    const secondInput = await nativeFetch(`${baseUrl}/api/v1/sessions/${session.id}/stdin`, { method: "POST", headers, body: JSON.stringify({ input: "beta\n" }) });
    expect(secondInput.status).toBe(202);
    await expect(nativeFetch(`${baseUrl}/api/agent/sessions/${session.id}/events`, { method: "POST", headers: agentHeaders, body: JSON.stringify({ sequence: 3, kind: "stdout", payload: "SECOND:beta\n" }) }).then(response => response.status)).resolves.toBe(202);
    await expect(nativeFetch(`${baseUrl}/api/agent/sessions/${session.id}/complete`, { method: "POST", headers: agentHeaders, body: JSON.stringify({ exitCode: 0 }) }).then(response => response.status)).resolves.toBe(200);
    streamAbort.abort();
    await reader!.cancel().catch(() => undefined);

    const history = await nativeFetch(`${baseUrl}/api/v1/sessions/${session.id}`, { headers: { authorization: "Bearer interactive-controller-key" } });
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({ data: { session: { state: "completed", exitCode: 0 }, events: [
      { kind: "status", payload: "Running" },
      { kind: "stdout", payload: "PROMPT: first value" },
      { kind: "stdin", payload: "alpha\n" },
      { kind: "stdout", payload: "FIRST:alpha\nPROMPT: second value" },
      { kind: "stdin", payload: "beta\n" },
      { kind: "stdout", payload: "SECOND:beta\n" },
      { kind: "status", payload: "Completed with exit status 0" },
    ] } });
    expect(events.map(event => event.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(fetch).toHaveBeenCalledWith("https://agent.example.com/v1/terminal-kit/sessions", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenCalledWith(`https://agent.example.com/v1/terminal-kit/sessions/${session.id}/stdin`, expect.objectContaining({ method: "POST", body: JSON.stringify({ input: "alpha\n" }) }));
    expect(fetch).toHaveBeenCalledWith(`https://agent.example.com/v1/terminal-kit/sessions/${session.id}/stdin`, expect.objectContaining({ method: "POST", body: JSON.stringify({ input: "beta\n" }) }));

    const login = await nativeFetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "interactive-admin-password" }) });
    const detail = await nativeFetch(`${baseUrl}/api/admin/instances/${instance.id}`, { headers: { cookie: login.headers.get("set-cookie") ?? "" } });
    const detailPayload = await detail.json() as { data: { instance: { id: number }; transactions: Array<{ session: { id: string; state: string; exitCode: number | null }; events: Array<{ kind: string; payload: string }> }> } };
    expect(detailPayload.data.instance.id).toBe(instance.id);
    expect(detailPayload.data.transactions[0]?.session).toMatchObject({ id: session.id, state: "completed", exitCode: 0 });
    const transactionEvents = detailPayload.data.transactions[0]?.events ?? [];
    expect(transactionEvents.some(event => event.kind === "stdin" && event.payload === "alpha\n")).toBe(true);
    expect(transactionEvents.some(event => event.kind === "stdin" && event.payload === "beta\n")).toBe(true);
    expect(transactionEvents.some(event => event.kind === "stdout" && event.payload === "SECOND:beta\n")).toBe(true);
  });
});
