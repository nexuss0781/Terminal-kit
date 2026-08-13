import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const instances = mysqlTable("instances", {
  id: int("id").autoincrement().primaryKey(),
  createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  instanceUrl: varchar("instanceUrl", { length: 2048 }).notNull(),
  status: mysqlEnum("status", ["pending", "online", "offline"]).default("pending").notNull(),
  enrollmentTokenHash: varchar("enrollmentTokenHash", { length: 128 }).notNull(),
  agentTokenHash: varchar("agentTokenHash", { length: 128 }),
  agentTokenCiphertext: text("agentTokenCiphertext"),
  cpuPercent: int("cpuPercent").default(0).notNull(),
  memoryPercent: int("memoryPercent").default(0).notNull(),
  memoryTotalMb: int("memoryTotalMb").default(0).notNull(),
  activeSessions: int("activeSessions").default(0).notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("instances_createdBy_idx").on(table.createdBy),
  index("instances_agentTokenHash_idx").on(table.agentTokenHash),
]);

export const terminalSessions = mysqlTable("terminalSessions", {
  id: varchar("id", { length: 40 }).primaryKey(),
  instanceId: int("instanceId").notNull().references(() => instances.id, { onDelete: "cascade" }),
  createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  command: text("command").notNull(),
  state: mysqlEnum("state", ["queued", "running", "completed", "failed"]).default("queued").notNull(),
  exitCode: int("exitCode"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("terminalSessions_instanceId_idx").on(table.instanceId),
  index("terminalSessions_createdBy_idx").on(table.createdBy),
]);

export const terminalEvents = mysqlTable("terminalEvents", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 40 }).notNull().references(() => terminalSessions.id, { onDelete: "cascade" }),
  sequence: int("sequence").notNull(),
  kind: mysqlEnum("kind", ["stdout", "stderr", "stdin", "status"]).notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("terminalEvents_sessionId_idx").on(table.sessionId),
  index("terminalEvents_session_sequence_idx").on(table.sessionId, table.sequence),
]);

export type Instance = typeof instances.$inferSelect;
export type TerminalSession = typeof terminalSessions.$inferSelect;
export type TerminalEvent = typeof terminalEvents.$inferSelect;
