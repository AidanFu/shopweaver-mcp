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

  it("gets an existing listing item by SKU with optimization-relevant included data", async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sku: "AMZ-HMF-0001" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonSpApiClient(store, fetchMock);

    await expect(client.getListingItem("AMZ-HMF-0001")).resolves.toEqual({ sku: "AMZ-HMF-0001" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/A1SELLER/AMZ-HMF-0001?marketplaceIds=ATVPDKIKX0DER&includedData=summaries%2Cattributes%2Cissues%2Coffers%2CfulfillmentAvailability");
  });

  it("validates listing item patches without applying Amazon listing changes", async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "VALID" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonSpApiClient(store, fetchMock);
    const patch = {
      productType: "TOWEL_HOLDER",
      patches: [{
        op: "replace" as const,
        path: "/attributes/item_name",
        value: [{ value: "Electric Towel Warmer Rack", marketplace_id: "ATVPDKIKX0DER" }]
      }]
    };

    await expect(client.patchListingItem("DH-E37S-W6DM", patch, { validationPreview: true })).resolves.toEqual({ status: "VALID" });
    expect(fetchMock).toHaveBeenCalledWith("https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/A1SELLER/DH-E37S-W6DM?marketplaceIds=ATVPDKIKX0DER&includedData=issues&mode=VALIDATION_PREVIEW&issueLocale=en_US", expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({
        "content-type": "application/json",
        "x-amz-access-token": "access",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)",
        host: "sellingpartnerapi-na.amazon.com"
      }),
      body: JSON.stringify(patch)
    }));
  });
});
