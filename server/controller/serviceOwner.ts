import { getUserByOpenId, upsertUser } from "../db";

export const CONTROLLER_SERVICE_OPEN_ID = "terminal-kit-controller-service";

/**
 * API-key-protected controller operations are owned by this deterministic
 * service record rather than an interactive OAuth identity.
 */
export async function getControllerServiceOwner() {
  await upsertUser({
    openId: CONTROLLER_SERVICE_OPEN_ID,
    name: "Terminal-Kit Controller",
    email: null,
    loginMethod: "controller-api-key",
    role: "admin",
    lastSignedIn: new Date(),
  });
  const owner = await getUserByOpenId(CONTROLLER_SERVICE_OPEN_ID);
  if (!owner) throw new Error("Controller service owner could not be initialized");
  return owner;
}
