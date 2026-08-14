import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "parad";
import { afterEach, describe, expect, it } from "vitest";
import { createParadoxStore, deriveDefaultParadoxCredentials, normalizeParadoxApiBase } from "./store";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("ParadoxDB controller store", () => {
  it("persists the controller’s user, instance, session, and ordered terminal events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "terminal-kit-paradox-"));
    tempDirectories.push(directory);
    const connection = await connect({
      name: "controller-test",
      dbPath: join(directory, "controller-test.db"),
      passphrase: "test-only-passphrase",
      autoSync: false,
    });
    const store = createParadoxStore(connection);
    store.initialize();

    const user = store.upsertUser({ openId: "owner", name: "Owner" }, "owner");
    const instance = store.createInstance({ createdBy: user.id, name: "instance-a", instanceUrl: "https://agent.example", enrollmentTokenHash: "enrollment" });
    const session = store.createSession({ id: "session-a", instanceId: instance.id, createdBy: user.id, command: "echo ready" });
    store.addEvent({ sessionId: session.id, sequence: 2, kind: "stdout", payload: "ready" });
    store.addEvent({ sessionId: session.id, sequence: 1, kind: "stdin", payload: "\n" });

    expect(store.getUserByOpenId("owner")?.role).toBe("admin");
    expect(store.listInstancesForUser(user.id)).toHaveLength(1);
    expect(store.listEvents(session.id).map(event => event.sequence)).toEqual([2, 1]);
    store.close();
  });

  it("uses the versioned ParadoxDB API base", () => {
    expect(normalizeParadoxApiBase("https://paradoxdb.onrender.com")).toBe("https://paradoxdb.onrender.com/v1");
    expect(normalizeParadoxApiBase("https://paradoxdb.onrender.com/v1/")).toBe("https://paradoxdb.onrender.com/v1");
  });

  it("derives stable, distinct service credentials from an existing controller secret", () => {
    const first = deriveDefaultParadoxCredentials("controller-secret");
    const second = deriveDefaultParadoxCredentials("controller-secret");
    expect(first).toEqual(second);
    expect(first.email).toContain("@service.paradoxdb.local");
    expect(first.database).toMatch(/^terminal-kit-controller-/);
    expect(first.password).not.toBe(first.passphrase);
  });
});
