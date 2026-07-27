import { describe, expect, it, vi } from "vitest";
import { AmazonAdsClient } from "../src/amazon/ads-client.js";
import { MemoryCredentialStore } from "../src/credentials/memory.js";

describe("AmazonAdsClient", () => {
  it("lists Amazon Ads profiles with refreshed authorization", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na"
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "ads-access",
        token_type: "bearer",
        expires_in: 3600
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ profileId: 123, countryCode: "US" }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.listProfiles()).resolves.toEqual([{ profileId: 123, countryCode: "US" }]);
    expect(fetchMock).toHaveBeenLastCalledWith("https://advertising-api.amazon.com/v2/profiles", expect.objectContaining({
      method: "GET",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      }
    }));
  });

  it("lists Sponsored Products campaigns for a profile without changing campaigns", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      campaigns: [{ campaignId: "123", name: "Auto Discovery", state: "ENABLED" }],
      nextToken: "next"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.listSponsoredProductsCampaigns("987654321", {
      stateFilter: { include: ["ENABLED", "PAUSED"] },
      maxResults: 50
    })).resolves.toEqual({
      campaigns: [{ campaignId: "123", name: "Auto Discovery", state: "ENABLED" }],
      nextToken: "next"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/campaigns/list", expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        Accept: "application/vnd.spCampaign.v3+json",
        "Content-Type": "application/vnd.spCampaign.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      },
      body: JSON.stringify({
        stateFilter: { include: ["ENABLED", "PAUSED"] },
        maxResults: 50
      })
    }));
  });
});
