import type { Express, Request, Response } from "express";
import { z } from "zod";
import { hasControllerApiAccess } from "./apiAuth";
import { createSecret, decryptSecret, encryptSecret, hashSecret } from "./crypto";
import { controllerRuntimeStatus } from "./runtimeStatus";
import { getControllerServiceOwner } from "./serviceOwner";
import {
  addTerminalEvent,
  chooseLeastLoadedInstanceGlobal,
  createInstance,
  createTerminalSession,
  getInstanceById,
  getSessionById,
  incrementActiveSessions,
  listAllInstances,
  listTerminalEvents,
  removeInstanceById,
  updateInstance,
  updateSession,
} from "./db";
import { generateAgentDockerfile } from "./dockerfile";
import { normalizeInstanceUrl } from "./protocol";
import { terminalEventBus, type TerminalStreamEvent } from "./stream";

const registerSchema = z.object({ name: z.string().trim().min(1).max(120), instanceUrl: z.string().url().max(2048) });
const commandSchema = z.object({ command: z.string().min(1).max(20_000), instanceId: z.number().int().positive().optional() });
const stdinSchema = z.object({ input: z.string().max(20_000) });
const renameSchema = z.object({ name: z.string().trim().min(1).max(120) });

function requestControllerUrl(req: Request) {
  return process.env.PUBLIC_CONTROLLER_URL?.replace(/\/$/, "") ?? `${req.protocol}://${req.get("host")}`;
}

async function sendDockerfile(instanceUrl: string, dockerfile: string, enrollmentToken: string) {
  const response = await fetch(`${instanceUrl}/v1/terminal-kit/bootstrap`, {
    method: "POST",
    headers: { "content-type": "text/plain; charset=utf-8", "x-terminal-kit-enrollment": enrollmentToken },
    body: dockerfile,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Instance returned ${response.status}`);
}

async function executeOnInstance(instance: NonNullable<Awaited<ReturnType<typeof getInstanceById>>>, sessionId: string, command: string) {
  if (!instance.agentTokenCiphertext) throw new Error("Instance has not completed enrollment");
  const agentToken = decryptSecret(instance.agentTokenCiphertext);
  const response = await fetch(`${instance.instanceUrl}/v1/terminal-kit/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({ sessionId, command }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Agent returned ${response.status}`);
}

function writeSse(res: Response, event: TerminalStreamEvent) {
  res.write(`event: terminal\ndata: ${JSON.stringify(event)}\n\n`);
}

function apiError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: { status, message } });
}

function openApiDocument(req: Request) {
  const baseUrl = requestControllerUrl(req);
  return {
    openapi: "3.1.0",
    info: { title: "Terminal-Kit Control Plane", version: "v1", description: "Backend-first API for Nexuss agentic AIs to orchestrate registered terminal instances." },
    servers: [{ url: `${baseUrl}/api/v1` }],
    components: { securitySchemes: { ControllerBearer: { type: "http", scheme: "bearer", bearerFormat: "CONTROLLER_API_KEY" } } },
    security: [{ ControllerBearer: [] }],
    paths: {
      "/health": { get: { summary: "Controller health" } },
      "/instances": { get: { summary: "List instances" }, post: { summary: "Register instance and generate Dockerfile communication protocol" } },
      "/instances/{instanceId}": { get: { summary: "Read instance and persisted session history" }, patch: { summary: "Rename instance" }, delete: { summary: "Remove instance" } },
      "/commands": { post: { summary: "Execute command on selected or least-loaded instance" } },
      "/sessions/{sessionId}": { get: { summary: "Read terminal session and ordered history" } },
      "/sessions/{sessionId}/stdin": { post: { summary: "Send stdin simulation to active process" } },
      "/sessions/{sessionId}/stream": { get: { summary: "Subscribe to real-time SSE stdout and stderr stream" } },
    },
  };
}

export function registerPublicControllerApi(app: Express) {
  app.use("/api/v1", (req, res, next) => hasControllerApiAccess(req) ? next() : apiError(res, 401, "Unauthorized"));

  app.get("/api/v1/openapi.json", (req, res) => res.status(200).json(openApiDocument(req)));
  app.get("/api/v1/health", (_req, res) => res.status(200).json({ status: "online", service: "terminal-kit-controller", version: "v1", runtime: controllerRuntimeStatus() }));

  app.get("/api/v1/instances", async (_req, res) => {
    try { return res.status(200).json({ data: await listAllInstances() }); }
    catch (error) { return apiError(res, 503, error instanceof Error ? error.message : "Instance registry unavailable"); }
  });

  app.post("/api/v1/instances", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, "name and HTTP(S) instanceUrl are required");
    try {
      const owner = await getControllerServiceOwner();
      const enrollmentToken = createSecret();
      const instanceUrl = normalizeInstanceUrl(parsed.data.instanceUrl);
      const instance = await createInstance({ createdBy: owner.id, name: parsed.data.name, instanceUrl, enrollmentTokenHash: hashSecret(enrollmentToken) });
      if (!instance) return apiError(res, 500, "Instance could not be created");
      const dockerfile = generateAgentDockerfile({ controllerUrl: requestControllerUrl(req), instanceName: instance.name, enrollmentToken });
      let deliveryStatus: "sent" | "pending" = "sent";
      let deliveryError: string | undefined;
      try { await sendDockerfile(instanceUrl, dockerfile, enrollmentToken); }
      catch (error) { deliveryStatus = "pending"; deliveryError = error instanceof Error ? error.message : "Dockerfile delivery failed"; }
      return res.status(201).json({ data: { instance, dockerfile, deliveryStatus, deliveryError } });
    } catch (error) { return apiError(res, 409, error instanceof Error ? error.message : "Instance registration failed"); }
  });

  app.get("/api/v1/instances/:instanceId", async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    if (!Number.isInteger(instanceId) || instanceId <= 0) return apiError(res, 400, "Invalid instanceId");
    try {
      const instance = await getInstanceById(instanceId);
      if (!instance) return apiError(res, 404, "Instance not found");
      const { listSessionsForInstanceAdmin } = await import("./db");
      return res.status(200).json({ data: { instance, sessions: await listSessionsForInstanceAdmin(instanceId) } });
    } catch (error) { return apiError(res, 503, error instanceof Error ? error.message : "Instance details unavailable"); }
  });

  app.patch("/api/v1/instances/:instanceId", async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    const parsed = renameSchema.safeParse(req.body);
    if (!Number.isInteger(instanceId) || instanceId <= 0 || !parsed.success) return apiError(res, 400, "Valid instanceId and name are required");
    try {
      const instance = await getInstanceById(instanceId);
      if (!instance) return apiError(res, 404, "Instance not found");
      return res.status(200).json({ data: await updateInstance(instanceId, { name: parsed.data.name }) });
    } catch (error) { return apiError(res, 503, error instanceof Error ? error.message : "Instance update failed"); }
  });

  app.delete("/api/v1/instances/:instanceId", async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    if (!Number.isInteger(instanceId) || instanceId <= 0) return apiError(res, 400, "Invalid instanceId");
    try { await removeInstanceById(instanceId); return res.status(204).end(); }
    catch (error) { return apiError(res, 503, error instanceof Error ? error.message : "Instance removal failed"); }
  });

  app.post("/api/v1/commands", async (req, res) => {
    const parsed = commandSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, "command is required; instanceId is optional");
    try {
      const owner = await getControllerServiceOwner();
      const instance = parsed.data.instanceId ? await getInstanceById(parsed.data.instanceId) : await chooseLeastLoadedInstanceGlobal();
      if (!instance || instance.status !== "online") return apiError(res, 409, "No online instance is available for command execution");
      const session = await createTerminalSession({ instanceId: instance.id, createdBy: owner.id, command: parsed.data.command });
      if (!session) return apiError(res, 500, "Session could not be created");
      try {
        await updateSession(session.id, { state: "running", startedAt: new Date() });
        await incrementActiveSessions(instance.id, 1);
        await executeOnInstance(instance, session.id, parsed.data.command);
        const event = await addTerminalEvent({ sessionId: session.id, sequence: 0, kind: "status", payload: "Running" });
        if (event) terminalEventBus.publish({ sessionId: session.id, sequence: 0, kind: "status", payload: "Running", createdAt: event.createdAt });
        return res.status(202).json({ data: { sessionId: session.id, instanceId: instance.id, route: parsed.data.instanceId ? "selected instance" : "least-loaded instance" } });
      } catch (error) {
        await incrementActiveSessions(instance.id, -1);
        await updateSession(session.id, { state: "failed", completedAt: new Date(), exitCode: 1 });
        const message = error instanceof Error ? error.message : "Command dispatch failed";
        await addTerminalEvent({ sessionId: session.id, sequence: 0, kind: "stderr", payload: message });
        return apiError(res, 502, message);
      }
    } catch (error) { return apiError(res, 503, error instanceof Error ? error.message : "Command execution unavailable"); }
  });

  app.get("/api/v1/sessions/:sessionId", async (req, res) => {
    try {
      const session = await getSessionById(req.params.sessionId);
      if (!session) return apiError(res, 404, "Terminal session not found");
      return res.status(200).json({ data: { session, events: await listTerminalEvents(session.id) } });
    } catch (error) { return apiError(res, 503, error instanceof Error ? error.message : "Terminal history unavailable"); }
  });

  app.post("/api/v1/sessions/:sessionId/stdin", async (req, res) => {
    const parsed = stdinSchema.safeParse(req.body);
    if (!parsed.success) return apiError(res, 400, "input is required");
    try {
      const session = await getSessionById(req.params.sessionId);
      if (!session || session.state !== "running") return apiError(res, 409, "Terminal session is not running");
      const instance = await getInstanceById(session.instanceId);
      if (!instance?.agentTokenCiphertext) return apiError(res, 409, "Instance is not enrolled");
      const agentToken = decryptSecret(instance.agentTokenCiphertext);
      const response = await fetch(`${instance.instanceUrl}/v1/terminal-kit/sessions/${session.id}/stdin`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${agentToken}` }, body: JSON.stringify({ input: parsed.data.input }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return apiError(res, 502, `Agent returned ${response.status}`);
      const events = await listTerminalEvents(session.id);
      const sequence = Math.max(0, ...events.map(event => event.sequence)) + 1;
      const event = await addTerminalEvent({ sessionId: session.id, sequence, kind: "stdin", payload: parsed.data.input });
      if (event) terminalEventBus.publish({ sessionId: session.id, sequence, kind: "stdin", payload: parsed.data.input, createdAt: event.createdAt });
      return res.status(202).json({ data: { accepted: true } });
    } catch (error) { return apiError(res, 503, error instanceof Error ? error.message : "stdin delivery unavailable"); }
  });

  app.get("/api/v1/sessions/:sessionId/stream", async (req, res) => {
    try {
      const session = await getSessionById(req.params.sessionId);
      if (!session) return apiError(res, 404, "Terminal session not found");
      if (req.query.preflight === "1") return res.status(200).json({ data: { sessionId: session.id } });
      res.status(200).set({ "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
      res.flushHeaders();
      (await listTerminalEvents(session.id)).forEach(event => writeSse(res, { sessionId: session.id, sequence: event.sequence, kind: event.kind, payload: event.payload, createdAt: event.createdAt }));
      const unsubscribe = terminalEventBus.subscribe(session.id, event => writeSse(res, event));
      const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 20_000);
      req.on("close", () => { clearInterval(keepAlive); unsubscribe(); res.end(); });
    } catch (error) { return apiError(res, 503, error instanceof Error ? error.message : "Terminal stream unavailable"); }
  });
}
