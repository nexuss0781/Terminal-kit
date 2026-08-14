import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const ADMIN_SESSION_COOKIE = "terminal_kit_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is required for administrator sessions");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function verifyAdminPassword(candidate: string | undefined) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !candidate) return false;
  const left = Buffer.from(password);
  const right = Buffer.from(candidate);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createAdminSession(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ scope: "terminal-kit-admin", exp: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function hasAdminSession(req: Request, now = Date.now()) {
  const cookie = req.headers.cookie?.split(";").map(value => value.trim()).find(value => value.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  const token = cookie?.slice(`${ADMIN_SESSION_COOKIE}=`.length);
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { scope?: string; exp?: number };
    return decoded.scope === "terminal-kit-admin" && typeof decoded.exp === "number" && decoded.exp > now;
  } catch {
    return false;
  }
}
