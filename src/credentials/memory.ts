import type { CredentialKey, CredentialStore, StoredRecords } from "./types.js";

export class MemoryCredentialStore implements CredentialStore {
  readonly #records = new Map<CredentialKey, string>();

  async get<K extends CredentialKey>(key: K): Promise<StoredRecords[K] | null> {
    const value = this.#records.get(key);
    return value === undefined ? null : JSON.parse(value) as StoredRecords[K];
  }

  async set<K extends CredentialKey>(key: K, value: StoredRecords[K]): Promise<void> {
    this.#records.set(key, JSON.stringify(value));
  }

  async delete(key: CredentialKey): Promise<void> {
    this.#records.delete(key);
  }
}
