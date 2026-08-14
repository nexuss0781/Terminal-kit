import { closeParadoxStore, getParadoxStore } from "../server/paradox/store";

async function provision() {
  const store = await getParadoxStore();
  const instances = store.listAllInstances();
  console.log(`ParadoxDB controller store is ready; existing instances: ${instances.length}`);
  await closeParadoxStore();
}

provision().catch(error => {
  console.error("ParadoxDB provisioning failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
