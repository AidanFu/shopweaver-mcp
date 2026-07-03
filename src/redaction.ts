const REDACTED = "[REDACTED]";
const sensitiveKey = /token|secret|authorization|cookie|code|email|address|payment|message/i;
const secrets = new Set<string>();

export function registerSecret(secret: string): void {
  if (secret.length >= 4) secrets.add(secret);
}

function redactString(value: string): string {
  let result = value;
  for (const secret of secrets) result = result.split(secret).join(REDACTED);
  return result;
}

export function redact(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sensitiveKey.test(key) ? REDACTED : redact(entry)])
    );
  }
  return value;
}
