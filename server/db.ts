import { ENV } from "./_core/env";
import { getParadoxStore } from "./paradox/store";
import type { InsertUser } from "./paradox/types";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  (await getParadoxStore()).upsertUser(user, ENV.ownerOpenId);
}

export async function getUserByOpenId(openId: string) {
  return (await getParadoxStore()).getUserByOpenId(openId);
}
