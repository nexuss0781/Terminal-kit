import type { Express, Request } from "express";
import { requireAdmin } from "./adminRoutes";
import { createSecret, hashSecret } from "./crypto";
import { createInstance, getInstanceById, listAllInstances, updateInstance } from "./db";
import { generateAgentDockerfile } from "./dockerfile";
import { getControllerServiceOwner } from "./serviceOwner";
import { summarizeFleet } from "./inventory";

function controllerUrl(req: Request) {
  return process.env.PUBLIC_CONTROLLER_URL?.replace(/\/$/, "") ?? `${req.protocol}://${req.get("host")}`;
}

export function registerAdminControlRoutes(app: Express) {
  app.get("/api/admin/inventory", requireAdmin, async (_req, res) => {
    try {
      const instances = await listAllInstances();
      return res.status(200).json({ data: { summary: summarizeFleet(instances), instances } });
    } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Fleet inventory unavailable" }); }
  });

  app.get("/api/admin/instances/:instanceId", requireAdmin, async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    if (!Number.isInteger(instanceId) || instanceId <= 0) return res.status(400).json({ error: "Invalid instance ID" });
    try {
      const instance = await getInstanceById(instanceId);
      return instance ? res.status(200).json({ data: instance }) : res.status(404).json({ error: "Instance not found" });
    } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Instance unavailable" }); }
  });

  app.patch("/api/admin/instances/:instanceId", requireAdmin, async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
    if (!Number.isInteger(instanceId) || instanceId <= 0 || !name) return res.status(400).json({ error: "A valid instance ID and name are required" });
    try {
      const instance = await updateInstance(instanceId, { name });
      return instance ? res.status(200).json({ data: instance }) : res.status(404).json({ error: "Instance not found" });
    } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Instance rename failed" }); }
  });

  app.get("/api/admin/provisioning/dockerfile", requireAdmin, async (req, res) => {
    try {
      const owner = await getControllerServiceOwner();
      const enrollmentToken = createSecret();
      const instance = await createInstance({
        createdBy: owner.id,
        name: `Pending agent ${enrollmentToken.slice(-8)}`,
        instanceUrl: "https://pending.invalid",
        enrollmentTokenHash: hashSecret(enrollmentToken),
      });
      const dockerfile = generateAgentDockerfile({ controllerUrl: controllerUrl(req), enrollmentToken });
      res.status(200).set({
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="Dockerfile.terminal-kit-${instance.id}"`,
        "cache-control": "no-store",
      }).send(dockerfile);
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Provisioning Dockerfile could not be created" });
    }
  });
}
