import { spawn } from "node:child_process";
import { KEYCHAIN_SERVICE } from "../config.js";
import { ShopWeaverError } from "../errors.js";
import { registerSecret } from "../redaction.js";
import type { CredentialKey, CredentialStore, StoredRecords } from "./types.js";

type CommandResult = { code: number; stdout: string };

function runSecurity(args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.once("error", error => reject(new ShopWeaverError("KEYCHAIN_UNAVAILABLE", "macOS Keychain is unavailable.", error)));
    child.once("close", code => resolve({ code: code ?? 1, stdout }));
  });
}

export class KeychainCredentialStore implements CredentialStore {
  constructor() {
    if (process.platform !== "darwin") {
      throw new ShopWeaverError("UNSUPPORTED_PLATFORM", "ShopWeaver version one requires macOS.");
    }
  }

  async get<K extends CredentialKey>(key: K): Promise<StoredRecords[K] | null> {
    const result = await runSecurity(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", key, "-w"]);
    if (result.code === 44) return null;
    if (result.code !== 0) throw new ShopWeaverError("KEYCHAIN_READ_FAILED", "Could not read ShopWeaver credentials from macOS Keychain.");
    try {
      const value = JSON.parse(result.stdout.trim()) as StoredRecords[K];
      for (const entry of Object.values(value)) if (typeof entry === "string") registerSecret(entry);
      return value;
    } catch (error) {
      throw new ShopWeaverError("KEYCHAIN_DATA_INVALID", "Stored ShopWeaver credentials are invalid; reconnect the Etsy account.", error);
    }
  }

  async set<K extends CredentialKey>(key: K, value: StoredRecords[K]): Promise<void> {
    const serialized = JSON.stringify(value);
    registerSecret(serialized);
    const result = await runSecurity(["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", key, "-w", serialized]);
    if (result.code !== 0) throw new ShopWeaverError("KEYCHAIN_WRITE_FAILED", "Could not store ShopWeaver credentials in macOS Keychain.");
  }

  async delete(key: CredentialKey): Promise<void> {
    const result = await runSecurity(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", key]);
    if (result.code !== 0 && result.code !== 44) {
      throw new ShopWeaverError("KEYCHAIN_DELETE_FAILED", "Could not delete ShopWeaver credentials from macOS Keychain.");
    }
  }
}
