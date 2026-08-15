import type { Express, Request, Response } from "express";
import { createSecret, decryptSecret, encryptSecret, hashSecret } from "./crypto";
import {
  addTerminalEvent,
  createInstance,
  getInstanceByAgentHash,
  getInstanceByEnrollmentHash,
  getInstanceByUrl,
  getSessionById,
  incrementActiveSessions,
  listTerminalEvents,
  updateInstance,
  updateSession,
} from "./db";
import { terminalEventBus } from "./stream";
import { isTerminalOutputKind, normalizeInstanceUrl } from "./protocol";
import { hasControllerApiAccess } from "./apiAuth";
import { getControllerServiceOwner } from "./serviceOwner";

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

function asShortText(value: unknown, limit = 160) {
  return typeof value === "string" ? value.trim().slice(0, limit) || null : null;
}

function reportedAgentMetadata(body: Record<string, unknown>) {
  const endpoint = typeof body.instanceUrl === "string" ? normalizeInstanceUrl(body.instanceUrl) : undefined;
  return {
    ...(endpoint ? { instanceUrl: endpoint } : {}),
    hostname: asShortText(body.hostname),
    agentVersion: asShortText(body.agentVersion),
    osPlatform: asShortText(body.osPlatform),
    architecture: asShortText(body.architecture),
    cpuCount: asNonNegativeInteger(body.cpuCount),
    cpuPercent: asNonNegativeInteger(body.cpuPercent),
    memoryPercent: asNonNegativeInteger(body.memoryPercent),
    memoryTotalMb: asNonNegativeInteger(body.memoryTotalMb),
    diskPercent: asNonNegativeInteger(body.diskPercent),
    diskTotalMb: asNonNegativeInteger(body.diskTotalMb),
    diskFreeMb: asNonNegativeInteger(body.diskFreeMb),
  };
}

function automaticName(metadata: ReturnType<typeof reportedAgentMetadata>) {
  return metadata.hostname ? `Terminal agent ${metadata.hostname}` : "Terminal agent";
}

async function verifyBootstrap(instanceUrl: string, bootstrapSecret: string) {
  const response = await fetch(`${instanceUrl}/v1/terminal-kit/bootstrap`, {
    method: "POST",
    headers: { "x-terminal-kit-bootstrap": bootstrapSecret },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("The deployed agent did not accept its bootstrap challenge");
}

export function registerControllerRoutes(app: Express) {
  app.get("/api/controller/health", (_req, res) => res.status(200).json({ status: "online" }));

  app.post("/api/agent/enroll", async (req, res) => {
    try {
      const enrollmentToken = typeof req.body?.enrollmentToken === "string" ? req.body.enrollmentToken : "";
      const instance = enrollmentToken ? await getInstanceByEnrollmentHash(hashSecret(enrollmentToken)) : undefined;
      if (!instance || instance.status !== "pending") return res.status(401).json({ error: "Invalid or expired enrollment" });
      const metadata = reportedAgentMetadata(req.body ?? {});
      if (!metadata.instanceUrl) return res.status(400).json({ error: "A public HTTP(S) instance URL is required for self-enrollment" });
      const agentToken = createSecret();
      const automaticName = metadata.hostname ?? `Terminal agent ${instance.id}`;
      await updateInstance(instance.id, {
        agentTokenHash: hashSecret(agentToken),
        agentTokenCiphertext: encryptSecret(agentToken),
        name: instance.name.startsWith("Pending agent") ? automaticName : instance.name,
        ...metadata,
        status: "online",
        lastSeenAt: new Date(),
      });
      return res.status(201).json({ instanceId: instance.id, agentToken });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Enrollment failed" });
    }
  });

  app.post("/api/agent/auto-enroll", async (req, res) => {
    try {
      const bootstrapSecret = typeof req.body?.bootstrapSecret === "string" ? req.body.bootstrapSecret : "";
      const metadata = reportedAgentMetadata(req.body ?? {});
      if (!bootstrapSecret || bootstrapSecret.length < 32) return res.status(400).json({ error: "Automatic bootstrap credential is required" });
      if (!metadata.instanceUrl) return res.status(400).json({ error: "A Render public endpoint is required for automatic enrollment" });
      if (!new URL(metadata.instanceUrl).hostname.toLowerCase().endsWith(".onrender.com")) {
        return res.status(400).json({ error: "Automatic enrollment currently accepts Render service endpoints only" });
      }

      await verifyBootstrap(metadata.instanceUrl, bootstrapSecret);
      const existing = await getInstanceByUrl(metadata.instanceUrl);
      const agentToken = existing?.agentTokenCiphertext ? decryptSecret(existing.agentTokenCiphertext) : createSecret();
      const updates = {
        enrollmentTokenHash: hashSecret(bootstrapSecret),
        agentTokenHash: hashSecret(agentToken),
        agentTokenCiphertext: encryptSecret(agentToken),
        ...(existing && !existing.name.startsWith("Pending agent") && !existing.name.startsWith("Terminal agent") ? {} : { name: automaticName(metadata) }),
        ...metadata,
        status: "online" as const,
        lastSeenAt: new Date(),
      };
      if (existing) {
        await updateInstance(existing.id, updates);
        return res.status(200).json({ instanceId: existing.id, agentToken });
      }

      const owner = await getControllerServiceOwner();
      const instance = await createInstance({
        createdBy: owner.id,
        name: automaticName(metadata),
        instanceUrl: metadata.instanceUrl,
        enrollmentTokenHash: hashSecret(bootstrapSecret),
      });
      await updateInstance(instance.id, updates);
      return res.status(201).json({ instanceId: instance.id, agentToken });
    } catch (error) {
      return res.status(503).json({ error: error instanceof Error ? error.message : "Automatic enrollment unavailable" });
    }
  });

  app.post("/api/agent/heartbeat", async (req, res) => {
    const instance = await authenticateAgent(req);
    if (!instance) return res.status(401).json({ error: "Unauthorized" });
    let metadata: ReturnType<typeof reportedAgentMetadata>;
    try { metadata = reportedAgentMetadata(req.body ?? {}); }
    catch { return res.status(400).json({ error: "Invalid reported instance URL" }); }
    await updateInstance(instance.id, {
      status: instance.status === "blocked" ? "blocked" : "online",
      ...metadata,
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
