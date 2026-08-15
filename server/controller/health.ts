import { listAllInstances, updateInstance } from "./db";
import type { Instance } from "../paradox/types";

function normalizedMetric(value: unknown, fallback: number) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : fallback;
}

export function healthUpdateFromProbe(previous: Pick<Instance, "status" | "cpuCount" | "cpuPercent" | "memoryPercent" | "memoryTotalMb" | "diskPercent" | "diskTotalMb" | "diskFreeMb">, metrics?: Record<string, unknown>, httpStatus: number | null = 200) {
  if (!metrics) return { status: previous.status === "blocked" ? "blocked" as const : "offline" as const, availability: "idle" as const, availabilityHttpStatus: httpStatus, availabilityCheckedAt: new Date() };
  return {
    status: previous.status === "blocked" ? "blocked" as const : "online" as const,
    availability: "active" as const,
    availabilityHttpStatus: httpStatus,
    availabilityCheckedAt: new Date(),
    cpuCount: normalizedMetric(metrics.cpuCount, previous.cpuCount ?? 0),
    cpuPercent: normalizedMetric(metrics.cpuPercent, previous.cpuPercent),
    memoryPercent: normalizedMetric(metrics.memoryPercent, previous.memoryPercent),
    memoryTotalMb: normalizedMetric(metrics.memoryTotalMb, previous.memoryTotalMb),
    diskPercent: normalizedMetric(metrics.diskPercent, previous.diskPercent ?? 0),
    diskTotalMb: normalizedMetric(metrics.diskTotalMb, previous.diskTotalMb ?? 0),
    diskFreeMb: normalizedMetric(metrics.diskFreeMb, previous.diskFreeMb ?? 0),
    lastSeenAt: new Date(),
  };
}

export async function runHealthSweep() {
  const knownInstances = await listAllInstances();
  await Promise.all(knownInstances.map(refreshInstanceAvailability));
}

export async function refreshInstanceAvailability(instance: Instance) {
  try {
    const response = await fetch(`${instance.instanceUrl}/v1/terminal-kit/health`, { signal: AbortSignal.timeout(7_500) });
    if (response.status !== 200) {
      return updateInstance(instance.id, healthUpdateFromProbe(instance, undefined, response.status));
    }
    const metrics = await response.json() as Record<string, unknown>;
    return updateInstance(instance.id, healthUpdateFromProbe(instance, metrics, response.status));
  } catch {
    return updateInstance(instance.id, healthUpdateFromProbe(instance, undefined, null));
  }
}
