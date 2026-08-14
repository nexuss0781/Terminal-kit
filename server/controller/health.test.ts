import { describe, expect, it } from "vitest";
import { healthUpdateFromProbe } from "./health";

describe("instance health state", () => {
  it("marks a successful probe online and normalizes reported resource metrics", () => {
    expect(healthUpdateFromProbe({ cpuCount: 1, cpuPercent: 20, memoryPercent: 35, memoryTotalMb: 1024, diskPercent: 10, diskTotalMb: 2048, diskFreeMb: 1800 }, {
      cpuCount: 2, cpuPercent: "17.4", memoryPercent: 48.6, memoryTotalMb: 2048, diskPercent: 30, diskTotalMb: 4096, diskFreeMb: 2800,
    })).toMatchObject({ status: "online", cpuCount: 2, cpuPercent: 17, memoryPercent: 49, memoryTotalMb: 2048, diskPercent: 30, diskTotalMb: 4096, diskFreeMb: 2800 });
  });

  it("marks a failed probe offline without replacing the last reported resource metrics", () => {
    expect(healthUpdateFromProbe({ cpuPercent: 20, memoryPercent: 35, memoryTotalMb: 1024 })).toEqual({ status: "offline" });
  });
});
