import { describe, expect, it } from "vitest";
import { healthUpdateFromProbe } from "./health";

describe("instance health state", () => {
  it("marks a successful probe online and normalizes reported resource metrics", () => {
    expect(healthUpdateFromProbe({ cpuPercent: 20, memoryPercent: 35, memoryTotalMb: 1024 }, {
      cpuPercent: "17.4", memoryPercent: 48.6, memoryTotalMb: 2048,
    })).toMatchObject({ status: "online", cpuPercent: 17, memoryPercent: 49, memoryTotalMb: 2048 });
  });

  it("marks a failed probe offline without replacing the last reported resource metrics", () => {
    expect(healthUpdateFromProbe({ cpuPercent: 20, memoryPercent: 35, memoryTotalMb: 1024 })).toEqual({ status: "offline" });
  });
});
