import { describe, expect, it } from "vitest";
import { summarizeFleet } from "./inventory";

describe("fleet inventory", () => {
  it("aggregates capacity and health from online self-enrolled instances", () => {
    const inventory = summarizeFleet([
      { id: 1, status: "online", cpuCount: 2, cpuPercent: 50, memoryTotalMb: 4096, memoryPercent: 25, diskTotalMb: 20_000, diskFreeMb: 15_000, diskPercent: 25, activeSessions: 1 },
      { id: 2, status: "online", cpuCount: 4, cpuPercent: 25, memoryTotalMb: 8192, memoryPercent: 50, diskTotalMb: 40_000, diskFreeMb: 20_000, diskPercent: 50, activeSessions: 2 },
      { id: 3, status: "offline", cpuCount: 8, cpuPercent: 90, memoryTotalMb: 16_000, memoryPercent: 90, diskTotalMb: 80_000, diskFreeMb: 1_000, diskPercent: 98, activeSessions: 0 },
    ] as never[]);
    expect(inventory).toMatchObject({
      instances: { registered: 3, online: 2, offline: 1, pending: 0 },
      capacity: { onlineCpuCores: 6, onlineMemoryTotalMb: 12_288, onlineMemoryAvailableMb: 7_168, onlineDiskTotalMb: 60_000, onlineDiskFreeMb: 35_000, activeSessions: 3 },
    });
  });
});
