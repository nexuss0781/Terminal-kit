import { describe, expect, it } from "vitest";
import { loadScore, selectLeastLoaded } from "./balancer";

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
});
