import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ updateInstance: vi.fn() }));
vi.mock("./db", () => db);

import { healthUpdateFromProbe, refreshInstanceAvailability } from "./health";

describe("instance health state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    db.updateInstance.mockReset();
  });

  it("marks a 200 endpoint probe Active and normalizes reported resource metrics", () => {
    expect(healthUpdateFromProbe({ status: "offline", cpuCount: 1, cpuPercent: 20, memoryPercent: 35, memoryTotalMb: 1024, diskPercent: 10, diskTotalMb: 2048, diskFreeMb: 1800 }, {
      cpuCount: 2, cpuPercent: "17.4", memoryPercent: 48.6, memoryTotalMb: 2048, diskPercent: 30, diskTotalMb: 4096, diskFreeMb: 2800,
    })).toMatchObject({ status: "online", availability: "active", availabilityHttpStatus: 200, cpuCount: 2, cpuPercent: 17, memoryPercent: 49, memoryTotalMb: 2048, diskPercent: 30, diskTotalMb: 4096, diskFreeMb: 2800 });
  });

  it("marks a 502 endpoint Idle without replacing the last reported resource metrics", () => {
    expect(healthUpdateFromProbe({ status: "online", cpuPercent: 20, memoryPercent: 35, memoryTotalMb: 1024 }, undefined, 502)).toMatchObject({ status: "offline", availability: "idle", availabilityHttpStatus: 502 });
  });

  it("keeps an administrator-blocked instance blocked even when its endpoint returns 200", () => {
    expect(healthUpdateFromProbe({ status: "blocked", cpuPercent: 20, memoryPercent: 35, memoryTotalMb: 1024 }, { cpuPercent: 10 })).toMatchObject({ status: "blocked", availability: "active" });
  });

  it("records no HTTP status when an endpoint is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")));
    db.updateInstance.mockResolvedValue(undefined);
    await refreshInstanceAvailability({ id: 9, instanceUrl: "https://idle-worker.example.com", status: "online", cpuCount: 2, cpuPercent: 20, memoryPercent: 35, memoryTotalMb: 1024, diskPercent: 10, diskTotalMb: 2048, diskFreeMb: 1800 } as never);
    expect(db.updateInstance).toHaveBeenCalledWith(9, expect.objectContaining({ status: "offline", availability: "idle", availabilityHttpStatus: null }));
  });
});
