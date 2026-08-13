import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function controllerKey(): Buffer {
  const secret = process.env.INSTANCE_CREDENTIAL_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error("INSTANCE_CREDENTIAL_KEY or JWT_SECRET is required to protect instance credentials");
  return createHash("sha256").update(secret).digest();
}

export function createSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, controllerKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(value => value.toString("base64url")).join(".");
}

export function decryptSecret(ciphertext: string): string {
  const [ivValue, tagValue, encryptedValue] = ciphertext.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid instance credential ciphertext");
  const decipher = createDecipheriv(ALGORITHM, controllerKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
