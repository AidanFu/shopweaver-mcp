import { describe, expect, it, vi } from "vitest";
import { AmazonAdsOAuth } from "../src/amazon/ads-oauth.js";
import { MemoryCredentialStore } from "../src/credentials/memory.js";

describe("AmazonAdsOAuth", () => {
  it("refreshes Amazon Ads access tokens without exposing secrets in errors", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na"
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "ads-access",
      token_type: "bearer",
      expires_in: 3600
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const oauth = new AmazonAdsOAuth(store, fetchMock, () => 2_000);

    await expect(oauth.refreshAccessToken()).resolves.toEqual({
      accessToken: "ads-access",
      expiresAt: 3_602_000
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.amazon.com/auth/o2/token", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "grant_type=refresh_token&refresh_token=ads-refresh&client_id=ads-client&client_secret=ads-secret"
    }));
  });

  it("fails safely when Amazon Ads credentials are missing", async () => {
    const oauth = new AmazonAdsOAuth(new MemoryCredentialStore(), vi.fn());
    await expect(oauth.refreshAccessToken()).rejects.toMatchObject({ code: "AMAZON_ADS_AUTH_REQUIRED" });
  });
});
