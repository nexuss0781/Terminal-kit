import { nanoid } from "nanoid";
import { getParadoxStore } from "../paradox/store";
import type { Instance, TerminalEvent, TerminalSession } from "../paradox/types";
import { selectLeastLoaded } from "./balancer";

export async function createInstance(values: Pick<Instance, "createdBy" | "name" | "instanceUrl" | "enrollmentTokenHash">) { return (await getParadoxStore()).createInstance(values); }
export async function getInstanceById(id: number) { return (await getParadoxStore()).getInstanceById(id); }
export async function getInstanceForUser(id: number, userId: number) { return (await getParadoxStore()).getInstanceForUser(id, userId); }
export async function getInstanceByEnrollmentHash(hash: string) { return (await getParadoxStore()).getInstanceByEnrollmentHash(hash); }
export async function getInstanceByAgentHash(hash: string) { return (await getParadoxStore()).getInstanceByAgentHash(hash); }
export async function listInstancesForUser(userId: number) { return (await getParadoxStore()).listInstancesForUser(userId); }
export async function listAllInstances() { return (await getParadoxStore()).listAllInstances(); }
export async function listSessionsForInstanceAdmin(instanceId: number) { return (await getParadoxStore()).listSessionsForInstance(instanceId); }
export async function updateInstance(id: number, values: Partial<Omit<Instance, "id" | "createdBy" | "createdAt" | "updatedAt">>) { return (await getParadoxStore()).updateInstance(id, values); }
export async function removeInstance(id: number, userId: number) { return (await getParadoxStore()).removeInstance(id, userId); }
export async function removeInstanceById(id: number) { return (await getParadoxStore()).removeInstance(id); }
export async function markStaleInstancesOffline(maxAgeMs: number) { return (await getParadoxStore()).markStaleInstancesOffline(maxAgeMs); }
export async function chooseLeastLoadedInstance(userId: number) { return selectLeastLoaded(await listInstancesForUser(userId)); }
export async function chooseLeastLoadedInstanceGlobal() { return selectLeastLoaded(await listAllInstances()); }
export async function createTerminalSession(values: Pick<TerminalSession, "instanceId" | "createdBy" | "command">) { return (await getParadoxStore()).createSession({ ...values, id: nanoid(20) }); }
export async function getSessionById(id: string) { return (await getParadoxStore()).getSessionById(id); }
export async function getSessionForUser(id: string, userId: number) { return (await getParadoxStore()).getSessionForUser(id, userId); }
export async function listSessionsForInstance(instanceId: number, userId: number) { return (await getParadoxStore()).listSessionsForInstance(instanceId, userId); }
export async function updateSession(id: string, values: Partial<Omit<TerminalSession, "id" | "instanceId" | "createdBy" | "command" | "createdAt" | "updatedAt">>) { return (await getParadoxStore()).updateSession(id, values); }
export async function incrementActiveSessions(instanceId: number, increment: number) { return (await getParadoxStore()).incrementActiveSessions(instanceId, increment); }
export async function addTerminalEvent(values: Omit<TerminalEvent, "id" | "createdAt">) { return (await getParadoxStore()).addEvent(values); }
export function orderTerminalEvents<T extends { id: number }>(events: T[]) { return [...events].sort((left, right) => left.id - right.id); }
export async function listTerminalEvents(sessionId: string) { return orderTerminalEvents((await getParadoxStore()).listEvents(sessionId)); }
export async function sessionInstances(sessionIds: string[]) { const sessions = await Promise.all(sessionIds.map(getSessionById)); return sessions.filter((session): session is TerminalSession => Boolean(session)); }
