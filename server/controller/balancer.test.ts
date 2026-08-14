import { describe, expect, it } from "vitest";
import { loadScore, selectLeastLoaded, selectPreferredInstance } from "./balancer";

describe("least-loaded instance routing", () => {
  it("routes only to online instances and prefers the lowest composite load", () => {
    const chosen = selectLeastLoaded([
      { id: 1, status: "offline" as const, cpuPercent: 1, memoryPercent: 1, activeSessions: 0 },
      { id: 2, status: "online" as const, cpuPercent: 42, memoryPercent: 20, activeSessions: 1 },
      { id: 3, status: "online" as const, cpuPercent: 30, memoryPercent: 25, activeSessions: 0 },
    ]);
    expect(chosen?.id).toBe(3);
    expect(loadScore(chosen!)).toBe(55);
  });

  it("returns undefined when no online instance is available", () => {
    expect(selectLeastLoaded([{ id: 1, status: "pending" as const, cpuPercent: 0, memoryPercent: 0, activeSessions: 0 }])).toBeUndefined();
  });

  it("allows an AI agent to prefer a resource dimension while keeping offline instances ineligible", () => {
    const candidates = [
      { id: 1, status: "online" as const, cpuPercent: 20, memoryPercent: 70, memoryTotalMb: 2048, diskPercent: 70, diskFreeMb: 100, activeSessions: 0 },
      { id: 2, status: "online" as const, cpuPercent: 60, memoryPercent: 20, memoryTotalMb: 16384, diskPercent: 15, diskFreeMb: 20_000, activeSessions: 0 },
      { id: 3, status: "offline" as const, cpuPercent: 1, memoryPercent: 1, memoryTotalMb: 32_000, diskPercent: 1, diskFreeMb: 50_000, activeSessions: 0 },
    ];
    expect(selectPreferredInstance(candidates, "cpu")?.id).toBe(1);
    expect(selectPreferredInstance(candidates, "memory")?.id).toBe(2);
    expect(selectPreferredInstance(candidates, "disk")?.id).toBe(2);
  });
});
