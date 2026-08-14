import type { Express, Request, Response } from "express";
import { createSecret, encryptSecret, hashSecret } from "./crypto";
import {
  addTerminalEvent,
  getInstanceByAgentHash,
  getInstanceByEnrollmentHash,
  getSessionById,
  incrementActiveSessions,
  listTerminalEvents,
  updateInstance,
  updateSession,
} from "./db";
import { terminalEventBus } from "./stream";
import { isTerminalOutputKind } from "./protocol";
import { hasControllerApiAccess } from "./apiAuth";

function bearerToken(req: Request) {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

async function authenticateAgent(req: Request) {
  const token = bearerToken(req);
  if (!token) return undefined;
  return getInstanceByAgentHash(hashSecret(token));
}

function asNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

export function registerControllerRoutes(app: Express) {
  app.get("/api/controller/health", (_req, res) => res.status(200).json({ status: "online" }));

  app.post("/api/agent/enroll", async (req, res) => {
    try {
      const enrollmentToken = typeof req.body?.enrollmentToken === "string" ? req.body.enrollmentToken : "";
      const instance = enrollmentToken ? await getInstanceByEnrollmentHash(hashSecret(enrollmentToken)) : undefined;
      if (!instance || instance.status !== "pending") return res.status(401).json({ error: "Invalid or expired enrollment" });
      if (req.body?.instanceName !== instance.name) return res.status(400).json({ error: "Instance name does not match enrollment" });
      const agentToken = createSecret();
      const reportedUrl = typeof req.body?.instanceUrl === "string" && req.body.instanceUrl ? req.body.instanceUrl : instance.instanceUrl;
      await updateInstance(instance.id, {
        agentTokenHash: hashSecret(agentToken),
        agentTokenCiphertext: encryptSecret(agentToken),
        instanceUrl: reportedUrl,
        status: "online",
        lastSeenAt: new Date(),
      });
      return res.status(201).json({ instanceId: instance.id, agentToken });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Enrollment failed" });
    }
  });

  app.post("/api/agent/heartbeat", async (req, res) => {
    const instance = await authenticateAgent(req);
    if (!instance) return res.status(401).json({ error: "Unauthorized" });
    await updateInstance(instance.id, {
      status: "online",
      cpuPercent: asNonNegativeInteger(req.body?.cpuPercent),
      memoryPercent: asNonNegativeInteger(req.body?.memoryPercent),
      memoryTotalMb: asNonNegativeInteger(req.body?.memoryTotalMb),
      lastSeenAt: new Date(),
    });
    return res.json({ accepted: true });
  });

  app.post("/api/agent/sessions/:sessionId/events", async (req, res) => {
    const instance = await authenticateAgent(req);
    if (!instance) return res.status(401).json({ error: "Unauthorized" });
    const session = await getSessionById(req.params.sessionId);
    if (!session || session.instanceId !== instance.id) return res.status(404).json({ error: "Terminal session not found" });
    const kind = req.body?.kind;
    if (!isTerminalOutputKind(kind) || typeof req.body?.payload !== "string") {
      return res.status(400).json({ error: "Invalid terminal event" });
    }
    const event = await addTerminalEvent({
      sessionId: session.id,
      sequence: asNonNegativeInteger(req.body?.sequence),
      kind,
      payload: req.body.payload,
    });
    if (event) terminalEventBus.publish({ sessionId: session.id, sequence: event.sequence, kind: event.kind, payload: event.payload, createdAt: event.createdAt });
    return res.status(202).json({ accepted: true });
  });

  app.post("/api/agent/sessions/:sessionId/complete", async (req, res) => {
    const instance = await authenticateAgent(req);
    if (!instance) return res.status(401).json({ error: "Unauthorized" });
    const session = await getSessionById(req.params.sessionId);
    if (!session || session.instanceId !== instance.id) return res.status(404).json({ error: "Terminal session not found" });
    const exitCode = Number.isFinite(Number(req.body?.exitCode)) ? Number(req.body.exitCode) : 1;
    const currentEvents = await listTerminalEvents(session.id);
    const sequence = Math.max(0, ...currentEvents.map(event => event.sequence)) + 1;
    const payload = `Completed with exit status ${exitCode}`;
    const event = await addTerminalEvent({ sessionId: session.id, sequence, kind: "status", payload });
    await updateSession(session.id, { state: exitCode === 0 ? "completed" : "failed", exitCode, completedAt: new Date() });
    await incrementActiveSessions(instance.id, -1);
    if (event) terminalEventBus.publish({ sessionId: session.id, sequence, kind: "status", payload, createdAt: event.createdAt });
    return res.json({ accepted: true });
  });

}
