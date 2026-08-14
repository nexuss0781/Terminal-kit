import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { instances, terminalEvents, terminalSessions } from "../../drizzle/schema";
import { getDb } from "../db";
import { selectLeastLoaded } from "./balancer";

function now() {
  return new Date();
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is unavailable");
  return db;
}

export async function createInstance(values: {
  createdBy: number;
  name: string;
  instanceUrl: string;
  enrollmentTokenHash: string;
}) {
  const db = await requireDb();
  const result = await db.insert(instances).values(values);
  const id = Number(result[0].insertId);
  return getInstanceById(id);
}

export async function getInstanceById(id: number) {
  const db = await requireDb();
  return (await db.select().from(instances).where(eq(instances.id, id)).limit(1))[0];
}

export async function getInstanceForUser(id: number, userId: number) {
  const db = await requireDb();
  return (await db.select().from(instances).where(and(eq(instances.id, id), eq(instances.createdBy, userId))).limit(1))[0];
}

export async function getInstanceByEnrollmentHash(enrollmentTokenHash: string) {
  const db = await requireDb();
  return (await db.select().from(instances).where(eq(instances.enrollmentTokenHash, enrollmentTokenHash)).limit(1))[0];
}

export async function getInstanceByAgentHash(agentTokenHash: string) {
  const db = await requireDb();
  return (await db.select().from(instances).where(eq(instances.agentTokenHash, agentTokenHash)).limit(1))[0];
}

export async function listInstancesForUser(userId: number) {
  const db = await requireDb();
  return db.select().from(instances).where(eq(instances.createdBy, userId)).orderBy(asc(instances.name));
}

export async function listAllInstances() {
  const db = await requireDb();
  return db.select().from(instances).orderBy(asc(instances.id));
}

export async function listSessionsForInstanceAdmin(instanceId: number) {
  const db = await requireDb();
  return db.select().from(terminalSessions).where(eq(terminalSessions.instanceId, instanceId)).orderBy(desc(terminalSessions.createdAt));
}

export async function updateInstance(id: number, values: Partial<typeof instances.$inferInsert>) {
  const db = await requireDb();
  await db.update(instances).set({ ...values, updatedAt: now() }).where(eq(instances.id, id));
  return getInstanceById(id);
}

export async function removeInstance(id: number, userId: number) {
  const db = await requireDb();
  await db.delete(instances).where(and(eq(instances.id, id), eq(instances.createdBy, userId)));
}

export async function markStaleInstancesOffline(maxAgeMs: number) {
  const db = await requireDb();
  const cutoff = new Date(Date.now() - maxAgeMs);
  await db.update(instances)
    .set({ status: "offline", updatedAt: now() })
    .where(and(eq(instances.status, "online"), lt(instances.lastSeenAt, cutoff)));
}

export async function chooseLeastLoadedInstance(userId: number) {
  return selectLeastLoaded(await listInstancesForUser(userId));
}

export async function chooseLeastLoadedInstanceGlobal() {
  return selectLeastLoaded(await listAllInstances());
}

export async function removeInstanceById(id: number) {
  const db = await requireDb();
  await db.delete(instances).where(eq(instances.id, id));
}

export async function createTerminalSession(values: { instanceId: number; createdBy: number; command: string }) {
  const db = await requireDb();
  const id = nanoid(20);
  await db.insert(terminalSessions).values({ ...values, id, state: "queued" });
  return getSessionById(id);
}

export async function getSessionById(id: string) {
  const db = await requireDb();
  return (await db.select().from(terminalSessions).where(eq(terminalSessions.id, id)).limit(1))[0];
}

export async function getSessionForUser(id: string, userId: number) {
  const db = await requireDb();
  return (await db.select().from(terminalSessions).where(and(eq(terminalSessions.id, id), eq(terminalSessions.createdBy, userId))).limit(1))[0];
}

export async function listSessionsForInstance(instanceId: number, userId: number) {
  const db = await requireDb();
  return db.select().from(terminalSessions)
    .where(and(eq(terminalSessions.instanceId, instanceId), eq(terminalSessions.createdBy, userId)))
    .orderBy(desc(terminalSessions.createdAt));
}

export async function updateSession(id: string, values: Partial<typeof terminalSessions.$inferInsert>) {
  const db = await requireDb();
  await db.update(terminalSessions).set({ ...values, updatedAt: now() }).where(eq(terminalSessions.id, id));
  return getSessionById(id);
}

export async function incrementActiveSessions(instanceId: number, increment: number) {
  const db = await requireDb();
  await db.update(instances)
    .set({ activeSessions: sql`GREATEST(0, ${instances.activeSessions} + ${increment})`, updatedAt: now() })
    .where(eq(instances.id, instanceId));
}

export async function addTerminalEvent(values: {
  sessionId: string;
  sequence: number;
  kind: "stdout" | "stderr" | "stdin" | "status";
  payload: string;
}) {
  const db = await requireDb();
  const result = await db.insert(terminalEvents).values(values);
  return (await db.select().from(terminalEvents).where(eq(terminalEvents.id, Number(result[0].insertId))).limit(1))[0];
}

export function orderTerminalEvents<T extends { id: number }>(events: T[]) {
  return [...events].sort((left, right) => left.id - right.id);
}

export async function listTerminalEvents(sessionId: string) {
  const db = await requireDb();
  return orderTerminalEvents(await db.select().from(terminalEvents).where(eq(terminalEvents.sessionId, sessionId)).orderBy(asc(terminalEvents.id)));
}

export async function sessionInstances(sessionIds: string[]) {
  if (!sessionIds.length) return [];
  const db = await requireDb();
  return db.select().from(terminalSessions).where(inArray(terminalSessions.id, sessionIds));
}
