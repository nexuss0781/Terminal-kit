import type { Express, Request } from "express";
import { requireAdmin } from "./adminRoutes";
import { getInstanceById, listAllInstances, removeInstanceById, updateInstance } from "./db";
import { generateAgentDockerfile } from "./dockerfile";
import { summarizeFleet } from "./inventory";
import { refreshInstanceAvailability, runHealthSweep } from "./health";

export function registerAdminControlRoutes(app: Express) {
  app.get("/api/admin/inventory", requireAdmin, async (_req, res) => {
    try {
      await runHealthSweep();
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

  app.post("/api/admin/instances/:instanceId/block", requireAdmin, async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    if (!Number.isInteger(instanceId) || instanceId <= 0) return res.status(400).json({ error: "Invalid instance ID" });
    try {
      const instance = await updateInstance(instanceId, { status: "blocked" });
      return instance ? res.status(200).json({ data: instance }) : res.status(404).json({ error: "Instance not found" });
    } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Instance block failed" }); }
  });

  app.post("/api/admin/instances/:instanceId/unblock", requireAdmin, async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    if (!Number.isInteger(instanceId) || instanceId <= 0) return res.status(400).json({ error: "Invalid instance ID" });
    try {
      const instance = await getInstanceById(instanceId);
      if (!instance) return res.status(404).json({ error: "Instance not found" });
      const restored = await updateInstance(instanceId, { status: "offline" });
      return res.status(200).json({ data: await refreshInstanceAvailability(restored ?? instance) });
    } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Instance unblock failed" }); }
  });

  app.post("/api/admin/instances/:instanceId/availability", requireAdmin, async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    if (!Number.isInteger(instanceId) || instanceId <= 0) return res.status(400).json({ error: "Invalid instance ID" });
    try {
      const instance = await getInstanceById(instanceId);
      if (!instance) return res.status(404).json({ error: "Instance not found" });
      return res.status(200).json({ data: await refreshInstanceAvailability(instance) });
    } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Availability refresh failed" }); }
  });

  app.delete("/api/admin/instances/:instanceId", requireAdmin, async (req, res) => {
    const instanceId = Number(req.params.instanceId);
    if (!Number.isInteger(instanceId) || instanceId <= 0) return res.status(400).json({ error: "Invalid instance ID" });
    try {
      const instance = await getInstanceById(instanceId);
      if (!instance) return res.status(404).json({ error: "Instance not found" });
      await removeInstanceById(instanceId);
      return res.status(204).end();
    } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : "Instance deletion failed" }); }
  });

  app.get("/api/admin/provisioning/dockerfile", requireAdmin, async (req, res) => {
    try {
      const dockerfile = generateAgentDockerfile();
      res.status(200).set({
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": "attachment; filename=Dockerfile.terminal-kit-agent",
        "cache-control": "no-store",
      }).send(dockerfile);
    } catch (error) {
      res.status(503).json({ error: error instanceof Error ? error.message : "Provisioning Dockerfile could not be created" });
    }
  });
}
