import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ createInstance: vi.fn(), getInstanceById: vi.fn(), listAllInstances: vi.fn(), updateInstance: vi.fn() }));
const owner = vi.hoisted(() => ({ getControllerServiceOwner: vi.fn() }));

vi.mock("./db", () => db);
vi.mock("./serviceOwner", () => owner);

import { registerAdminControlRoutes } from "./adminControlRoutes";
import { registerAdminRoutes } from "./adminRoutes";

describe("administrator provisioning download", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    process.env.PUBLIC_CONTROLLER_URL = "https://terminalkit.example.com";
    Object.values(db).forEach(mock => mock.mockReset());
    owner.getControllerServiceOwner.mockReset();
    owner.getControllerServiceOwner.mockResolvedValue({ id: 7 });
    db.createInstance.mockResolvedValue({ id: 42 });
    db.listAllInstances.mockResolvedValue([]);
    const app = express();
    app.use(express.json());
    registerAdminRoutes(app);
    registerAdminControlRoutes(app);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("requires an administrator session and returns a self-enrolling protocol Dockerfile", async () => {
    await expect(fetch(`${baseUrl}/api/admin/provisioning/dockerfile`).then(response => response.status)).resolves.toBe(401);
    const login = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
    const dockerfile = await fetch(`${baseUrl}/api/admin/provisioning/dockerfile`, { headers: { cookie: login.headers.get("set-cookie") ?? "" } });
    expect(dockerfile.status).toBe(200);
    await expect(dockerfile.text()).resolves.toContain("TERMINAL_KIT_PROTOCOL_VERSION=2");
    expect(db.createInstance).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 7, instanceUrl: "https://pending.invalid", name: expect.stringMatching(/^Pending agent /) }));
  });

  it("returns fleet inventory and allows the administrator to rename a self-enrolled instance", async () => {
    const instance = { id: 21, name: "render-worker", status: "online", cpuCount: 2, cpuPercent: 25, memoryTotalMb: 4096, memoryPercent: 50, diskTotalMb: 20_000, diskFreeMb: 12_000, diskPercent: 40, activeSessions: 1 };
    db.listAllInstances.mockResolvedValue([instance]);
    db.getInstanceById.mockResolvedValue(instance);
    db.updateInstance.mockResolvedValue({ ...instance, name: "primary-worker" });
    const login = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
    const headers = { cookie: login.headers.get("set-cookie") ?? "", "content-type": "application/json" };

    const inventory = await fetch(`${baseUrl}/api/admin/inventory`, { headers });
    expect(inventory.status).toBe(200);
    await expect(inventory.json()).resolves.toMatchObject({ data: { summary: { instances: { registered: 1, online: 1 }, capacity: { onlineCpuCores: 2 } } } });

    const renamed = await fetch(`${baseUrl}/api/admin/instances/21`, { method: "PATCH", headers, body: JSON.stringify({ name: "primary-worker" }) });
    expect(renamed.status).toBe(200);
    expect(db.updateInstance).toHaveBeenCalledWith(21, { name: "primary-worker" });
  });
});
