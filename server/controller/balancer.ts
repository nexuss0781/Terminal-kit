export type LoadCandidate = {
  id: number;
  status: "pending" | "online" | "offline";
  cpuPercent: number;
  memoryPercent: number;
  activeSessions: number;
};

export function loadScore(instance: LoadCandidate) {
  return instance.cpuPercent + instance.memoryPercent + instance.activeSessions * 25;
}

export function selectLeastLoaded<T extends LoadCandidate>(instances: T[]): T | undefined {
  return instances
    .filter(instance => instance.status === "online")
    .sort((a, b) => loadScore(a) - loadScore(b) || a.id - b.id)[0];
}
