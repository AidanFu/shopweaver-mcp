export type CredentialKey = "app" | "oauth" | "shop";

export type StoredRecords = {
  app: { keystring: string; sharedSecret: string; redirectUri: string };
  oauth: { accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] };
  shop: { userId: number; shopId: number };
};

export interface CredentialStore {
  get<K extends CredentialKey>(key: K): Promise<StoredRecords[K] | null>;
  set<K extends CredentialKey>(key: K, value: StoredRecords[K]): Promise<void>;
  delete(key: CredentialKey): Promise<void>;
}
