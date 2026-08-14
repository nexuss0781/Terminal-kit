import type { Express, Request, Response } from "express";
import { ADMIN_SESSION_COOKIE, createAdminSession, hasAdminSession, verifyAdminPassword } from "./adminAuth";

function secureCookie(req: Request) {
  return req.secure || req.header("x-forwarded-proto") === "https";
}

export function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!hasAdminSession(req)) return res.status(401).json({ error: "Administrator authentication required" });
  next();
}

export function registerAdminRoutes(app: Express) {
  app.post("/api/admin/login", (req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!verifyAdminPassword(password)) return res.status(401).json({ error: "Invalid administrator password" });
    res.cookie(ADMIN_SESSION_COOKIE, createAdminSession(), {
      httpOnly: true,
      secure: secureCookie(req),
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60 * 1000,
    });
    return res.status(200).json({ authenticated: true });
  });

  app.post("/api/admin/logout", (_req, res) => {
    res.clearCookie(ADMIN_SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
    return res.status(200).json({ authenticated: false });
  });

  app.get("/api/admin/session", (req, res) => res.status(200).json({ authenticated: hasAdminSession(req) }));
}
