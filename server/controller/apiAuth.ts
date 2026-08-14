import { timingSafeEqual } from "crypto";
import type { Request } from "express";

function bearerToken(req: Request) {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

export function hasControllerApiAccess(req: Request) {
  const configured = process.env.CONTROLLER_API_KEY;
  const supplied = bearerToken(req);
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured);
  const candidate = Buffer.from(supplied);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
