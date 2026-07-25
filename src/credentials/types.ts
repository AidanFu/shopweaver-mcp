export type CredentialKey = "app" | "oauth" | "shop" | "googleApp" | "google";

export type StoredRecords = {
  app: { keystring: string; sharedSecret: string; redirectUri: string };
  oauth: { accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] };
  shop: { userId: number; shopId: number };
  googleApp: { clientId: string; clientSecret: string; redirectUri: string };
  google: { accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] };
};

export interface CredentialStore {
  get<K extends CredentialKey>(key: K): Promise<StoredRecords[K] | null>;
  set<K extends CredentialKey>(key: K, value: StoredRecords[K]): Promise<void>;
  delete(key: CredentialKey): Promise<void>;
}
