import { closeParadoxStore, getParadoxStore } from "../server/paradox/store";

async function verify() {
  const store = await getParadoxStore();
  const user = store.upsertUser({ openId: "paradox-default-validation", name: "ParadoxDB validation", role: "admin" });
  const instance = store.createInstance({
    createdBy: user.id,
    name: "paradox-validation-instance",
    instanceUrl: "https://validation.invalid",
    enrollmentTokenHash: "validation",
  });
  const session = store.createSession({ id: "paradox-default-validation-session", instanceId: instance.id, createdBy: user.id, command: "true" });
  store.addEvent({ sessionId: session.id, sequence: 0, kind: "status", payload: "validated" });
  const persisted = store.listEvents(session.id)[0];
  if (persisted?.payload !== "validated") throw new Error("ParadoxDB controller event persistence check failed");
  await store.push();
  store.removeInstance(instance.id, user.id);
  await store.push();
  await closeParadoxStore();
  console.log("ParadoxDB default persistence and synchronization verified.");
}

verify().catch(error => {
  console.error("ParadoxDB default verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
