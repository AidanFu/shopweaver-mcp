export type TokenHealthProvider = "google_drive" | "etsy" | "amazon_sp_api" | "amazon_ads" | "ebay";
export type AccessTokenStatus = "missing" | "valid" | "expiring" | "expired" | "unknown";
export type RefreshStatus = "not_needed" | "refreshed" | "failed" | "not_supported" | "skipped";

export type TokenHealthStatus = {
  provider: TokenHealthProvider;
  connected: boolean;
  credentialsAvailable: boolean;
  authorized: boolean;
  accessTokenStatus: AccessTokenStatus;
  refreshStatus: RefreshStatus;
  expiresAt: string | null;
  scopes: string[];
  nextAction: string | null;
};

export function accessTokenStatus(expiresAt: number | undefined, now = Date.now(), refreshWindowMs = 60_000): AccessTokenStatus {
  if (expiresAt === undefined) return "missing";
  if (expiresAt <= now) return "expired";
  if (expiresAt <= now + refreshWindowMs) return "expiring";
  return "valid";
}

export function isoExpiresAt(expiresAt: number | undefined): string | null {
  return expiresAt === undefined ? null : new Date(expiresAt).toISOString();
}

export function reconnectAction(provider: TokenHealthProvider): string {
  const actions: Record<TokenHealthProvider, string> = {
    google_drive: "Run npm run google:setup to reconnect Google Drive.",
    etsy: "Run npm run setup to reconnect Etsy.",
    amazon_sp_api: "Run npm run amazon:setup to reconnect Amazon SP-API.",
    amazon_ads: "Run npm run amazon:ads:setup to reconnect Amazon Ads.",
    ebay: "Run npm run ebay:setup to reconnect eBay."
  };

  return actions[provider];
}
