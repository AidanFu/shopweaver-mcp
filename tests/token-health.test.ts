import { describe, expect, it } from "vitest";
import {
  accessTokenStatus,
  reconnectAction,
  type TokenHealthProvider,
  type TokenHealthStatus
} from "../src/auth/token-health.js";

describe("token health helpers", () => {
  it("classifies missing, expired, expiring, and valid access tokens", () => {
    expect(accessTokenStatus(undefined, 1_000)).toBe("missing");
    expect(accessTokenStatus(999, 1_000)).toBe("expired");
    expect(accessTokenStatus(61_000, 1_000)).toBe("expiring");
    expect(accessTokenStatus(62_000, 1_000)).toBe("valid");
  });

  it("uses stable provider-specific reconnect action messages", () => {
    const expectedActions: Record<TokenHealthProvider, string> = {
      google_drive: "Run npm run google:setup to reconnect Google Drive.",
      etsy: "Run npm run setup to reconnect Etsy.",
      amazon_sp_api: "Run npm run amazon:setup to reconnect Amazon SP-API.",
      amazon_ads: "Run npm run amazon:ads:setup to reconnect Amazon Ads.",
      ebay: "Run npm run ebay:setup to reconnect eBay."
    };

    expect(Object.fromEntries(
      Object.keys(expectedActions).map((provider) => [
        provider,
        reconnectAction(provider as TokenHealthProvider)
      ])
    )).toEqual(expectedActions);
  });

  it("keeps the shared status shape token-free", () => {
    const status: TokenHealthStatus = {
      provider: "google_drive",
      connected: false,
      credentialsAvailable: true,
      authorized: false,
      accessTokenStatus: "expired",
      refreshStatus: "failed",
      expiresAt: null,
      scopes: [],
      nextAction: reconnectAction("google_drive")
    };
    expect(JSON.stringify(status)).not.toContain("\"accessToken\":");
    expect(JSON.stringify(status)).not.toContain("\"refreshToken\":");
  });
});
