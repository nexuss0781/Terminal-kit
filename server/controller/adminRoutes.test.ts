import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerAdminRoutes } from "./adminRoutes";

describe("administrator password session", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    expect(process.env.ADMIN_PASSWORD).toBeTruthy();
    expect(process.env.JWT_SECRET).toBeTruthy();
    const app = express();
    app.use(express.json());
    registerAdminRoutes(app);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("accepts the configured administrator password and creates a signed HttpOnly session", async () => {
    const rejected = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "incorrect" }) });
    expect(rejected.status).toBe(401);

    const login = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie");
    expect(cookie).toContain("terminal_kit_admin=");
    expect(cookie).toContain("HttpOnly");

    const session = await fetch(`${baseUrl}/api/admin/session`, { headers: { cookie: cookie ?? "" } });
    await expect(session.json()).resolves.toEqual({ authenticated: true });
  });
});
