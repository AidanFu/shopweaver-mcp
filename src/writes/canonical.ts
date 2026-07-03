import { createHash } from "node:crypto";
import { ShopWeaverError } from "../errors.js";

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ShopWeaverError("INVALID_WRITE_PAYLOAD", "Write payload contains a non-finite number.");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => {
      if (entry === undefined) throw new ShopWeaverError("INVALID_WRITE_PAYLOAD", "Write payload contains an undefined value.");
      return [key, normalize(entry)];
    }));
  }
  throw new ShopWeaverError("INVALID_WRITE_PAYLOAD", "Write payload contains an unsupported value.");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
