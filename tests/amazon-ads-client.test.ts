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
});
