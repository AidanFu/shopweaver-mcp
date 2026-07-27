import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { AmazonSpApiClient } from "../src/amazon/sp-api-client.js";

describe("AmazonSpApiClient", () => {
  it("calls read-only marketplace participation endpoint with the stored seller authorization", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonSpApiApp", { clientId: "client", clientSecret: "secret" });
    await store.set("amazonSpApiAuth", {
      refreshToken: "refresh",
      accessToken: "access",
      expiresAt: Date.now() + 120_000,
      sellingPartnerId: "A1SELLER",
      region: "na",
      marketplaceIds: ["ATVPDKIKX0DER"]
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payload: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonSpApiClient(store, fetchMock);

    await expect(client.getMarketplaceParticipations()).resolves.toEqual({ payload: [] });
    expect(fetchMock).toHaveBeenCalledWith("https://sellingpartnerapi-na.amazon.com/sellers/v1/marketplaceParticipations", expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({
        "x-amz-access-token": "access",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)",
        host: "sellingpartnerapi-na.amazon.com"
      })
    }));
  });

  it("rejects Amazon SP-API calls when seller authorization is missing", async () => {
    const client = new AmazonSpApiClient(new MemoryCredentialStore(), vi.fn());
    await expect(client.getMarketplaceParticipations()).rejects.toMatchObject({ code: "AMAZON_SP_API_AUTH_REQUIRED" });
  });
});
