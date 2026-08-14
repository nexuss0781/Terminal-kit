import { afterEach, describe, expect, it, vi } from "vitest";
import { clearParadoxGatewayResolverCache, resolveParadoxGateway } from "./domainResolver";

afterEach(() => clearParadoxGatewayResolverCache());

describe("ParadoxDB active-domain resolver", () => {
  it("uses the configured resolver document and caches the validated active gateway for its TTL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ schemaVersion: 1, gatewayUrl: "https://paradox-new.example.com/v1", ttlSeconds: 30, resolverVersion: "deployment-42" }), { status: 200 }));
    const first = await resolveParadoxGateway({ resolverUrl: "https://resolver.example.com/active-domain.json", fetchImpl, now: () => 1_000 });
    const second = await resolveParadoxGateway({ resolverUrl: "https://resolver.example.com/active-domain.json", fetchImpl, now: () => 2_000 });
    expect(first).toMatchObject({ gatewayUrl: "https://paradox-new.example.com/v1", source: "resolver", resolverVersion: "deployment-42" });
    expect(second.source).toBe("cache");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses a configured fallback when the resolver is unavailable", async () => {
    const resolution = await resolveParadoxGateway({ resolverUrl: "https://resolver.example.com/active-domain.json", fallbackGatewayUrl: "https://paradox-fallback.example.com/v1", fetchImpl: vi.fn().mockRejectedValue(new Error("offline")), now: () => 1_000 });
    expect(resolution).toMatchObject({ gatewayUrl: "https://paradox-fallback.example.com/v1", source: "fallback" });
  });

  it("rejects a resolver response that does not supply a safe gateway URL", async () => {
    await expect(resolveParadoxGateway({ resolverUrl: "https://resolver.example.com/active-domain.json", fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ schemaVersion: 1, gatewayUrl: "file:///tmp/paradox", ttlSeconds: 60 }), { status: 200 })), now: () => 1_000 })).rejects.toThrow("HTTP or HTTPS");
  });
});
