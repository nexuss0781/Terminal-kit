import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("../db", () => db);

import { CONTROLLER_SERVICE_OPEN_ID, getControllerServiceOwner } from "./serviceOwner";

describe("controller service owner", () => {
  beforeEach(() => {
    db.getUserByOpenId.mockReset();
    db.upsertUser.mockReset();
    db.upsertUser.mockResolvedValue(undefined);
  });

  it("creates and returns a deterministic admin owner without an OAuth identity", async () => {
    const owner = { id: 17, openId: CONTROLLER_SERVICE_OPEN_ID, role: "admin" };
    db.getUserByOpenId.mockResolvedValue(owner);

    await expect(getControllerServiceOwner()).resolves.toEqual(owner);
    expect(db.upsertUser).toHaveBeenCalledWith(expect.objectContaining({
      openId: CONTROLLER_SERVICE_OPEN_ID,
      role: "admin",
      loginMethod: "controller-api-key",
    }));
    expect(db.getUserByOpenId).toHaveBeenCalledWith(CONTROLLER_SERVICE_OPEN_ID);
  });
});
