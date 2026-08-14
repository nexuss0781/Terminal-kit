import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { decryptSecret, createSecret, encryptSecret, hashSecret } from "./crypto";
import {
  chooseLeastLoadedInstance,
  createInstance,
  createTerminalSession,
  getInstanceForUser,
  incrementActiveSessions,
  listInstancesForUser,
  listSessionsForInstance,
  listTerminalEvents,
  markStaleInstancesOffline,
  orderTerminalEvents,
  removeInstance,
  updateInstance,
  updateSession,
} from "./db";
import { generateAgentDockerfile } from "./dockerfile";
import { addTerminalEvent } from "./db";
import { terminalEventBus } from "./stream";
import { protectedProcedure, router } from "../_core/trpc";
import { normalizeInstanceUrl } from "./protocol";

const HEARTBEAT_TIMEOUT_MS = 75_000;

function controllerUrl(req: { protocol?: string; get?: (name: string) => string | undefined }) {
  const configured = process.env.PUBLIC_CONTROLLER_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const host = req.get?.("host");
  if (!host) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Cannot determine controller URL" });
  return `${req.protocol ?? "https"}://${host}`;
}

async function deliverDockerfile(instanceUrl: string, dockerfile: string, enrollmentToken: string) {
  const response = await fetch(`${instanceUrl}/v1/terminal-kit/bootstrap`, {
    method: "POST",
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-terminal-kit-enrollment": enrollmentToken,
    },
    body: dockerfile,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Instance returned ${response.status}`);
}

async function dispatchCommand(instance: NonNullable<Awaited<ReturnType<typeof getInstanceForUser>>>, sessionId: string, command: string) {
  if (!instance.agentTokenCiphertext) throw new Error("Instance has not completed enrollment");
  const agentToken = decryptSecret(instance.agentTokenCiphertext);
  const response = await fetch(`${instance.instanceUrl}/v1/terminal-kit/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${agentToken}` },
    body: JSON.stringify({ sessionId, command }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Agent returned ${response.status}`);
}

export const controllerRouter = router({
  instances: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await markStaleInstancesOffline(HEARTBEAT_TIMEOUT_MS);
      return listInstancesForUser(ctx.user.id);
    }),
    register: protectedProcedure.input(z.object({ name: z.string().trim().min(1).max(120), instanceUrl: z.string().url().max(2048) }))
      .mutation(async ({ ctx, input }) => {
        let instanceUrl: string;
        try {
          instanceUrl = normalizeInstanceUrl(input.instanceUrl);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid HTTP(S) instance URL" });
        }
        const enrollmentToken = createSecret();
        const instance = await createInstance({
          createdBy: ctx.user.id,
          name: input.name,
          instanceUrl,
          enrollmentTokenHash: hashSecret(enrollmentToken),
        });
        if (!instance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Instance could not be created" });
        const dockerfile = generateAgentDockerfile({
          controllerUrl: controllerUrl(ctx.req),
          enrollmentToken,
        });
        let deliveryStatus: "sent" | "pending" = "sent";
        let deliveryError: string | undefined;
        try {
          await deliverDockerfile(instanceUrl, dockerfile, enrollmentToken);
        } catch (error) {
          deliveryStatus = "pending";
          deliveryError = error instanceof Error ? error.message : "Delivery could not be completed";
        }
        return { instance, dockerfile, deliveryStatus, deliveryError };
      }),
    rename: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(120) }))
      .mutation(async ({ ctx, input }) => {
        const instance = await getInstanceForUser(input.id, ctx.user.id);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instance was not found" });
        return updateInstance(instance.id, { name: input.name });
      }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await removeInstance(input.id, ctx.user.id);
        return { success: true } as const;
      }),
    details: protectedProcedure.input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const instance = await getInstanceForUser(input.id, ctx.user.id);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instance was not found" });
        const sessions = await listSessionsForInstance(instance.id, ctx.user.id);
        return { instance, sessions };
      }),
  }),
  sessions: router({
    create: protectedProcedure.input(z.object({ command: z.string().min(1).max(20_000), instanceId: z.number().int().positive().optional() }))
      .mutation(async ({ ctx, input }) => {
        await markStaleInstancesOffline(HEARTBEAT_TIMEOUT_MS);
        const instance = input.instanceId
          ? await getInstanceForUser(input.instanceId, ctx.user.id)
          : await chooseLeastLoadedInstance(ctx.user.id);
        if (!instance || instance.status !== "online") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No online instance is available for command execution" });
        }
        const session = await createTerminalSession({ instanceId: instance.id, createdBy: ctx.user.id, command: input.command });
        if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Session could not be created" });
        try {
          await updateSession(session.id, { state: "running", startedAt: new Date() });
          await incrementActiveSessions(instance.id, 1);
          await dispatchCommand(instance, session.id, input.command);
          const event = await addTerminalEvent({ sessionId: session.id, sequence: 0, kind: "status", payload: "Running" });
          if (event) terminalEventBus.publish({ sessionId: session.id, sequence: 0, kind: "status", payload: "Running", createdAt: event.createdAt });
          return { sessionId: session.id, instanceId: instance.id, route: input.instanceId ? "selected instance" : "least-loaded instance" };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Command dispatch failed";
          await incrementActiveSessions(instance.id, -1);
          await updateSession(session.id, { state: "failed", completedAt: new Date(), exitCode: 1 });
          await addTerminalEvent({ sessionId: session.id, sequence: 0, kind: "stderr", payload: message });
          throw new TRPCError({ code: "BAD_GATEWAY", message });
        }
      }),
    history: protectedProcedure.input(z.object({ sessionId: z.string().min(1).max(40) }))
      .query(async ({ ctx, input }) => {
        const { getSessionForUser } = await import("./db");
        const session = await getSessionForUser(input.sessionId, ctx.user.id);
        if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal session was not found" });
        return { session, events: orderTerminalEvents(await listTerminalEvents(session.id)) };
      }),
    stdin: protectedProcedure.input(z.object({ sessionId: z.string().min(1).max(40), input: z.string().max(20_000) }))
      .mutation(async ({ ctx, input }) => {
        const { getSessionForUser } = await import("./db");
        const session = await getSessionForUser(input.sessionId, ctx.user.id);
        if (!session || session.state !== "running") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The terminal session is not running" });
        const instance = await getInstanceForUser(session.instanceId, ctx.user.id);
        if (!instance?.agentTokenCiphertext) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Instance is not enrolled" });
        const agentToken = decryptSecret(instance.agentTokenCiphertext);
        const response = await fetch(`${instance.instanceUrl}/v1/terminal-kit/sessions/${session.id}/stdin`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${agentToken}` },
          body: JSON.stringify({ input: input.input }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: `Agent returned ${response.status}` });
        const events = await listTerminalEvents(session.id);
        const sequence = Math.max(0, ...events.map(event => event.sequence)) + 1;
        const event = await addTerminalEvent({ sessionId: session.id, sequence, kind: "stdin", payload: input.input });
        if (event) terminalEventBus.publish({ sessionId: session.id, sequence, kind: "stdin", payload: input.input, createdAt: event.createdAt });
        return { success: true } as const;
      }),
  }),
});
