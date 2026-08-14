import { describe, expect, it } from "vitest";
import { controllerRuntimeStatus } from "./runtimeStatus";

describe("controller runtime status", () => {
  it("reports only whether the dedicated instance credential key is configured", () => {
    expect(controllerRuntimeStatus({})).toEqual({ instanceCredentialKeyConfigured: false });
    expect(controllerRuntimeStatus({ INSTANCE_CREDENTIAL_KEY: "configured-but-never-exposed" })).toEqual({ instanceCredentialKeyConfigured: true });
  });
});
