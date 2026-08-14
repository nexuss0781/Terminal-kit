import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasControllerApiAccess } from "./apiAuth";

describe("configured controller API key", () => {
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    const app = express();
    app.get("/api/v1/health", (req, res) => {
      if (!hasControllerApiAccess(req)) return res.status(401).json({ error: "Unauthorized" });
      return res.status(200).json({ status: "online" });
    });
    server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("accepts the configured secret and rejects unauthenticated health requests", async () => {
    const key = process.env.CONTROLLER_API_KEY;
    expect(key).toBeTruthy();
    await expect(fetch(`${baseUrl}/api/v1/health`).then(response => response.status)).resolves.toBe(401);
    await expect(fetch(`${baseUrl}/api/v1/health`, { headers: { authorization: `Bearer ${key}` } }).then(response => response.status)).resolves.toBe(200);
  });
});
