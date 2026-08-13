import { describe, expect, it } from "vitest";
import { createSecret, decryptSecret, encryptSecret, hashSecret } from "./crypto";

describe("instance credentials", () => {
  it("creates hashed and encrypted credentials without exposing the original value", () => {
    process.env.INSTANCE_CREDENTIAL_KEY = "terminal-kit-test-secret";
    const secret = createSecret();
    const encrypted = encryptSecret(secret);
    expect(secret).toHaveLength(43);
    expect(hashSecret(secret)).not.toContain(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });
});
