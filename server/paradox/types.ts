export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "admin" | "user";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type InsertUser = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: "admin" | "user";
  lastSignedIn?: Date;
};

export type Instance = {
  id: number;
  createdBy: number;
  name: string;
  instanceUrl: string;
  status: "pending" | "online" | "offline";
  enrollmentTokenHash: string;
  agentTokenHash: string | null;
  agentTokenCiphertext: string | null;
  cpuPercent: number;
  memoryPercent: number;
  memoryTotalMb: number;
  activeSessions: number;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TerminalSession = {
  id: string;
  instanceId: number;
  createdBy: number;
  command: string;
  state: "queued" | "running" | "completed" | "failed";
  exitCode: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TerminalEvent = {
  id: number;
  sessionId: string;
  sequence: number;
  kind: "stdout" | "stderr" | "stdin" | "status";
  payload: string;
  createdAt: Date;
};
