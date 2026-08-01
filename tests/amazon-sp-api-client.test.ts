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

  it("lists seller orders for a created date window without changing Amazon data", async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ payload: { Orders: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonSpApiClient(store, fetchMock);

    await expect(client.listOrders({
      createdAfter: "2026-07-29T00:00:00Z",
      createdBefore: "2026-08-01T00:00:00Z",
      orderStatuses: ["Unshipped", "Shipped"],
      maxResultsPerPage: 50
    })).resolves.toEqual({ payload: { Orders: [] } });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(`${url.origin}${url.pathname}`).toBe("https://sellingpartnerapi-na.amazon.com/orders/v0/orders");
    expect(url.searchParams.get("MarketplaceIds")).toBe("ATVPDKIKX0DER");
    expect(url.searchParams.get("CreatedAfter")).toBe("2026-07-29T00:00:00Z");
    expect(url.searchParams.get("CreatedBefore")).toBe("2026-08-01T00:00:00Z");
    expect(url.searchParams.get("OrderStatuses")).toBe("Unshipped,Shipped");
    expect(url.searchParams.get("MaxResultsPerPage")).toBe("50");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({
        "x-amz-access-token": "access",
        host: "sellingpartnerapi-na.amazon.com"
      })
    }));
  });

  it("includes sanitized Amazon SP-API error details when a request fails", async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      errors: [{ code: "Unauthorized", message: "Access to requested resource is denied." }]
    }), {
      status: 403,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonSpApiClient(store, fetchMock);

    await expect(client.listOrders({ createdAfter: "2026-07-29T00:00:00Z" })).rejects.toThrow("Amazon SP-API request failed: 403 - Unauthorized - Access to requested resource is denied.");
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

  it("searches A+ publish records for one ASIN", async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ publishRecordList: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonSpApiClient(store, fetchMock);

    await expect(client.getAplusContentPublishRecords("B0GDPKVXSZ")).resolves.toEqual({ publishRecordList: [] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://sellingpartnerapi-na.amazon.com/aplus/2020-11-01/contentPublishRecords?marketplaceId=ATVPDKIKX0DER&asin=B0GDPKVXSZ");
  });

  it("gets an A+ content document with content and metadata", async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ contentRecord: { contentReferenceKey: "doc-1" } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonSpApiClient(store, fetchMock);

    await expect(client.getAplusContentDocument("doc-1")).resolves.toEqual({ contentRecord: { contentReferenceKey: "doc-1" } });
    expect(fetchMock.mock.calls[0][0]).toBe("https://sellingpartnerapi-na.amazon.com/aplus/2020-11-01/contentDocuments/doc-1?marketplaceId=ATVPDKIKX0DER&includedDataSet=CONTENTS%2CMETADATA");
  });

  it("validates an A+ content document against ASIN relations without publishing changes", async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ warnings: [], errors: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonSpApiClient(store, fetchMock);
    const contentDocument = { name: "Optimized A+ Gold", contentType: "EBC", locale: "en-US", contentModuleList: [] };

    await expect(client.validateAplusContentDocument(["B0GDPKVXSZ"], contentDocument)).resolves.toEqual({ warnings: [], errors: [] });
    expect(fetchMock).toHaveBeenCalledWith("https://sellingpartnerapi-na.amazon.com/aplus/2020-11-01/contentAsinValidations?marketplaceId=ATVPDKIKX0DER&asinSet=B0GDPKVXSZ", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "content-type": "application/json",
        "x-amz-access-token": "access",
        host: "sellingpartnerapi-na.amazon.com"
      }),
      body: JSON.stringify({ contentDocument })
    }));
  });

  it("fails SP-API requests cleanly when Amazon does not respond before the timeout", async () => {
    vi.useFakeTimers();
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
    const fetchMock = vi.fn((_input, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const client = new AmazonSpApiClient(store, fetchMock as never, undefined, 1000);

    const promise = expect(client.getMarketplaceParticipations()).rejects.toMatchObject({ code: "AMAZON_SP_API_REQUEST_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    vi.useRealTimers();
  });
});
