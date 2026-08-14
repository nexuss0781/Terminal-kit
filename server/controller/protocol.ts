export const TERMINAL_KIT_PROTOCOL_VERSION = "TERMINAL_KIT_PROTOCOL_VERSION=2";

export function normalizeInstanceUrl(value: string) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Instance URL must use HTTP or HTTPS");
  return url.toString().replace(/\/$/, "");
}

export function isTerminalOutputKind(value: unknown): value is "stdout" | "stderr" {
  return value === "stdout" || value === "stderr";
}
