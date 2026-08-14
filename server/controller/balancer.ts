export type LoadCandidate = {
  id: number;
  status: "pending" | "online" | "offline";
  cpuCount?: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryTotalMb?: number;
  diskPercent?: number;
  diskFreeMb?: number;
  activeSessions: number;
};

export type ResourcePreference = "balanced" | "cpu" | "memory" | "disk";

export function loadScore(instance: LoadCandidate) {
  return instance.cpuPercent + instance.memoryPercent + instance.activeSessions * 25;
}

export function selectLeastLoaded<T extends LoadCandidate>(instances: T[]): T | undefined {
  return selectPreferredInstance(instances, "balanced");
}

export function preferenceScore(instance: LoadCandidate, preference: ResourcePreference) {
  const sessionPenalty = instance.activeSessions * 10;
  if (preference === "cpu") return instance.cpuPercent + sessionPenalty;
  if (preference === "memory") return instance.memoryPercent + sessionPenalty - Math.min(20, Math.log2(Math.max(1, instance.memoryTotalMb ?? 0)));
  if (preference === "disk") return (instance.diskPercent ?? 100) + sessionPenalty - Math.min(15, Math.log2(Math.max(1, instance.diskFreeMb ?? 0)));
  return loadScore(instance);
}

export function selectPreferredInstance<T extends LoadCandidate>(instances: T[], preference: ResourcePreference = "balanced"): T | undefined {
  return instances
    .filter(instance => instance.status === "online")
    .sort((a, b) => preferenceScore(a, preference) - preferenceScore(b, preference) || a.id - b.id)[0];
}
