import { decryptSecret } from "./crypto";
import { listAllInstances, updateInstance } from "./db";

export const HEARTBEAT_INTERVAL_MS = 30_000;

function normalizedMetric(value: unknown, fallback: number) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : fallback;
}

export function healthUpdateFromProbe(previous: { cpuCount?: number; cpuPercent: number; memoryPercent: number; memoryTotalMb: number; diskPercent?: number; diskTotalMb?: number; diskFreeMb?: number }, metrics?: Record<string, unknown>) {
  if (!metrics) return { status: "offline" as const };
  return {
    status: "online" as const,
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
  await Promise.all(knownInstances.map(async instance => {
    if (!instance.agentTokenCiphertext) return;
    try {
      const agentToken = decryptSecret(instance.agentTokenCiphertext);
      const response = await fetch(`${instance.instanceUrl}/v1/terminal-kit/health`, {
        headers: { authorization: `Bearer ${agentToken}` },
        signal: AbortSignal.timeout(7_500),
      });
      if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
      const metrics = await response.json() as Record<string, unknown>;
      await updateInstance(instance.id, healthUpdateFromProbe(instance, metrics));
    } catch {
      await updateInstance(instance.id, { status: "offline" });
    }
  }));
}

export function startHealthMonitor() {
  void runHealthSweep().catch(error => console.error("Terminal-Kit health sweep failed", error));
  const timer = setInterval(() => {
    void runHealthSweep().catch(error => console.error("Terminal-Kit health sweep failed", error));
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
}
