import type { Instance } from "../paradox/types";

export function summarizeFleet(instances: Instance[]) {
  const online = instances.filter(instance => instance.status === "online");
  const sum = (items: Instance[], selector: (instance: Instance) => number) => items.reduce((total, instance) => total + Math.max(0, selector(instance) || 0), 0);
  const memoryTotalMb = sum(online, instance => instance.memoryTotalMb);
  const memoryUsedMb = sum(online, instance => Math.round(instance.memoryTotalMb * instance.memoryPercent / 100));
  const diskTotalMb = sum(online, instance => instance.diskTotalMb);
  const diskFreeMb = sum(online, instance => instance.diskFreeMb);
  const weighted = (field: "cpuPercent" | "memoryPercent" | "diskPercent", capacity: (instance: Instance) => number) => {
    const total = sum(online, capacity);
    return total ? Math.round(sum(online, instance => instance[field] * capacity(instance)) / total) : 0;
  };
  return {
    instances: {
      registered: instances.length,
      online: online.length,
      offline: instances.filter(instance => instance.status === "offline").length,
      pending: instances.filter(instance => instance.status === "pending").length,
    },
    capacity: {
      onlineCpuCores: sum(online, instance => instance.cpuCount),
      onlineMemoryTotalMb: memoryTotalMb,
      onlineMemoryAvailableMb: Math.max(0, memoryTotalMb - memoryUsedMb),
      onlineDiskTotalMb: diskTotalMb,
      onlineDiskFreeMb: diskFreeMb,
      activeSessions: sum(online, instance => instance.activeSessions),
    },
    utilization: {
      cpuPercent: weighted("cpuPercent", instance => Math.max(1, instance.cpuCount)),
      memoryPercent: weighted("memoryPercent", instance => Math.max(1, instance.memoryTotalMb)),
      diskPercent: weighted("diskPercent", instance => Math.max(1, instance.diskTotalMb)),
    },
  } as const;
}
