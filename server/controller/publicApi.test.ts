import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerPublicControllerApi } from "./publicApi";

describe("versioned controller API", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    registerPublicControllerApi(app);
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("protects health and OpenAPI discovery with the configured controller API key", async () => {
    const key = process.env.CONTROLLER_API_KEY;
    expect(key).toBeTruthy();
    await expect(fetch(`${baseUrl}/api/v1/health`).then(response => response.status)).resolves.toBe(401);
    const health = await fetch(`${baseUrl}/api/v1/health`, { headers: { authorization: `Bearer ${key}` } });
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: "online", version: "v1" });
    const specification = await fetch(`${baseUrl}/api/v1/openapi.json`, { headers: { authorization: `Bearer ${key}` } });
    expect(specification.status).toBe(200);
    await expect(specification.json()).resolves.toMatchObject({ openapi: "3.1.0", paths: expect.objectContaining({ "/commands": expect.anything() }) });
  });
});
