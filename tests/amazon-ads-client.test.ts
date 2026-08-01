import { describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
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

  it("updates Sponsored Products campaign state for pause or archive actions", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      campaigns: {
        success: [{ index: 0, campaignId: "123" }],
        error: []
      }
    }), { status: 207, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.updateSponsoredProductsCampaigns("987654321", [{
      campaignId: "123",
      state: "ARCHIVED"
    }])).resolves.toEqual({
      campaigns: {
        success: [{ index: 0, campaignId: "123" }],
        error: []
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/campaigns", expect.objectContaining({
      method: "PUT",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        Accept: "application/vnd.spCampaign.v3+json",
        "Content-Type": "application/vnd.spCampaign.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      },
      body: JSON.stringify({
        campaigns: [{
          campaignId: "123",
          state: "ARCHIVED"
        }]
      })
    }));
  });

  it("updates Sponsored Products campaign dynamic bidding for approved placement controls", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      campaigns: {
        success: [{ index: 0, campaignId: "123" }],
        error: []
      }
    }), { status: 207, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.updateSponsoredProductsCampaigns("987654321", [{
      campaignId: "123",
      dynamicBidding: {
        strategy: "AUTO_FOR_SALES",
        placementBidding: [{ placement: "PLACEMENT_TOP", percentage: 0 }]
      }
    }])).resolves.toEqual({
      campaigns: {
        success: [{ index: 0, campaignId: "123" }],
        error: []
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/campaigns", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({
        campaigns: [{
          campaignId: "123",
          dynamicBidding: {
            strategy: "AUTO_FOR_SALES",
            placementBidding: [{ placement: "PLACEMENT_TOP", percentage: 0 }]
          }
        }]
      })
    }));
  });

  it("creates Sponsored Products campaigns for approved launch plans", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      campaigns: {
        success: [{ index: 0, campaignId: "campaign-1" }],
        error: []
      }
    }), { status: 207, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.createSponsoredProductsCampaigns("987654321", [{
      name: "ShopWeaver | Charms | Auto Discovery",
      targetingType: "AUTO",
      state: "PAUSED",
      startDate: "2026-07-30",
      budget: { budgetType: "DAILY", budget: 5 },
      dynamicBidding: { strategy: "AUTO_FOR_SALES", placementBidding: [] }
    }])).resolves.toEqual({
      campaigns: {
        success: [{ index: 0, campaignId: "campaign-1" }],
        error: []
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/campaigns", expect.objectContaining({
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
        campaigns: [{
          name: "ShopWeaver | Charms | Auto Discovery",
          targetingType: "AUTO",
          state: "PAUSED",
          startDate: "2026-07-30",
          budget: { budgetType: "DAILY", budget: 5 },
          dynamicBidding: { strategy: "AUTO_FOR_SALES", placementBidding: [] }
        }]
      })
    }));
  });

  it("lists Sponsored Products ad groups for a campaign without changing bids", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      adGroups: [{ adGroupId: "456", campaignId: "123", name: "Exact Winners", state: "ENABLED", defaultBid: 0.75 }],
      totalResults: 1
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.listSponsoredProductsAdGroups("987654321", {
      campaignIdFilter: { include: ["123"] },
      stateFilter: { include: ["ENABLED"] },
      includeExtendedDataFields: true,
      maxResults: 50
    })).resolves.toEqual({
      adGroups: [{ adGroupId: "456", campaignId: "123", name: "Exact Winners", state: "ENABLED", defaultBid: 0.75 }],
      totalResults: 1
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/adGroups/list", expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        Accept: "application/vnd.spAdGroup.v3+json",
        "Content-Type": "application/vnd.spAdGroup.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      },
      body: JSON.stringify({
        campaignIdFilter: { include: ["123"] },
        stateFilter: { include: ["ENABLED"] },
        includeExtendedDataFields: true,
        maxResults: 50
      })
    }));
  });

  it("updates Sponsored Products ad group default bids for approved profile actions", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      adGroups: {
        success: [{ index: 0, adGroupId: "456" }],
        error: []
      }
    }), { status: 207, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.updateSponsoredProductsAdGroups("987654321", [{
      adGroupId: "456",
      defaultBid: 0.3
    }])).resolves.toEqual({
      adGroups: {
        success: [{ index: 0, adGroupId: "456" }],
        error: []
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/adGroups", expect.objectContaining({
      method: "PUT",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        Accept: "application/vnd.spAdGroup.v3+json",
        "Content-Type": "application/vnd.spAdGroup.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      },
      body: JSON.stringify({
        adGroups: [{
          adGroupId: "456",
          defaultBid: 0.3
        }]
      })
    }));
  });

  it("lists Sponsored Products keywords for an ad group without changing bids", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      keywords: [{ keywordId: "789", campaignId: "123", adGroupId: "456", keywordText: "crochet keychain", matchType: "EXACT", state: "ENABLED", bid: 0.45 }],
      totalResults: 1
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.listSponsoredProductsKeywords("987654321", {
      campaignIdFilter: { include: ["123"] },
      adGroupIdFilter: { include: ["456"] },
      stateFilter: { include: ["ENABLED"] },
      includeExtendedDataFields: true,
      maxResults: 50
    })).resolves.toEqual({
      keywords: [{ keywordId: "789", campaignId: "123", adGroupId: "456", keywordText: "crochet keychain", matchType: "EXACT", state: "ENABLED", bid: 0.45 }],
      totalResults: 1
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/keywords/list", expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        Accept: "application/vnd.spKeyword.v3+json",
        "Content-Type": "application/vnd.spKeyword.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      },
      body: JSON.stringify({
        campaignIdFilter: { include: ["123"] },
        adGroupIdFilter: { include: ["456"] },
        stateFilter: { include: ["ENABLED"] },
        includeExtendedDataFields: true,
        maxResults: 50
      })
    }));
  });

  it("updates Sponsored Products keyword bids for approved profile actions", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      keywords: {
        success: [{ index: 0, keywordId: "789" }],
        error: []
      }
    }), { status: 207, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.updateSponsoredProductsKeywords("987654321", [{
      keywordId: "789",
      bid: 0.25
    }])).resolves.toEqual({
      keywords: {
        success: [{ index: 0, keywordId: "789" }],
        error: []
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/keywords", expect.objectContaining({
      method: "PUT",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        Accept: "application/vnd.spKeyword.v3+json",
        "Content-Type": "application/vnd.spKeyword.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      },
      body: JSON.stringify({
        keywords: [{
          keywordId: "789",
          bid: 0.25
        }]
      })
    }));
  });

  it("creates Sponsored Products negative keywords for an approved profile action", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      negativeKeywords: {
        success: [{ index: 0, negativeKeywordId: "999" }],
        error: []
      }
    }), { status: 207, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.createSponsoredProductsNegativeKeywords("987654321", [{
      campaignId: "123",
      adGroupId: "456",
      keywordText: "free crochet pattern",
      matchType: "NEGATIVE_EXACT",
      state: "ENABLED"
    }])).resolves.toEqual({
      negativeKeywords: {
        success: [{ index: 0, negativeKeywordId: "999" }],
        error: []
      }
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/sp/negativeKeywords", expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        Accept: "application/vnd.spNegativeKeyword.v3+json",
        "Content-Type": "application/vnd.spNegativeKeyword.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      },
      body: JSON.stringify({
        negativeKeywords: [{
          campaignId: "123",
          adGroupId: "456",
          keywordText: "free crochet pattern",
          matchType: "NEGATIVE_EXACT",
          state: "ENABLED"
        }]
      })
    }));
  });

  it("requests a Sponsored Products search-term report for later campaign optimization", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reportId: "report-1", status: "PENDING" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.createSponsoredProductsSearchTermReport("987654321", {
      name: "SP search terms 2026-07-01 to 2026-07-07",
      startDate: "2026-07-01",
      endDate: "2026-07-07",
      timeUnit: "SUMMARY",
      keywordType: ["BROAD", "PHRASE", "EXACT"]
    })).resolves.toEqual({ reportId: "report-1", status: "PENDING" });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/reporting/reports", expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      },
      body: JSON.stringify({
        name: "SP search terms 2026-07-01 to 2026-07-07",
        startDate: "2026-07-01",
        endDate: "2026-07-07",
        configuration: {
          adProduct: "SPONSORED_PRODUCTS",
          groupBy: ["searchTerm"],
          columns: ["impressions", "clicks", "cost", "campaignId", "campaignName", "adGroupId", "adGroupName", "startDate", "endDate", "keywordType", "keyword", "matchType", "keywordId", "searchTerm", "sales7d", "purchases7d", "acosClicks7d", "roasClicks7d"],
          filters: [{ field: "keywordType", values: ["BROAD", "PHRASE", "EXACT"] }],
          reportTypeId: "spSearchTerm",
          timeUnit: "SUMMARY",
          format: "GZIP_JSON"
        }
      })
    }));
  });

  it("requests a Sponsored Products advertised-product report for SKU-level campaign analysis", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reportId: "sku-report-1", status: "PENDING" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.createSponsoredProductsAdvertisedProductReport("987654321", {
      name: "SP advertised products 2026-07-01 to 2026-07-07",
      startDate: "2026-07-01",
      endDate: "2026-07-07",
      timeUnit: "SUMMARY"
    })).resolves.toEqual({ reportId: "sku-report-1", status: "PENDING" });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/reporting/reports", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        "Content-Type": "application/vnd.createasyncreportrequest.v3+json"
      }),
      body: JSON.stringify({
        name: "SP advertised products 2026-07-01 to 2026-07-07",
        startDate: "2026-07-01",
        endDate: "2026-07-07",
        configuration: {
          adProduct: "SPONSORED_PRODUCTS",
          groupBy: ["advertiser"],
          columns: ["impressions", "clicks", "cost", "campaignId", "campaignName", "adGroupId", "adGroupName", "startDate", "endDate", "advertisedAsin", "advertisedSku", "sales7d", "purchases7d", "attributedSalesSameSku7d", "unitsSoldSameSku7d", "acosClicks7d", "roasClicks7d"],
          reportTypeId: "spAdvertisedProduct",
          timeUnit: "SUMMARY",
          format: "GZIP_JSON"
        }
      })
    }));
  });

  it("gets Amazon Ads report status by report ID", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonAdsApp", { clientId: "ads-client", clientSecret: "ads-secret" });
    await store.set("amazonAdsAuth", {
      refreshToken: "ads-refresh",
      region: "na",
      accessToken: "ads-access",
      expiresAt: Date.now() + 3_600_000
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      reportId: "report-1",
      status: "COMPLETED",
      url: "https://example.com/report.gz"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.getReport("987654321", "report-1")).resolves.toEqual({
      reportId: "report-1",
      status: "COMPLETED",
      url: "https://example.com/report.gz"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://advertising-api.amazon.com/reporting/reports/report-1", expect.objectContaining({
      method: "GET",
      headers: {
        Authorization: "Bearer ads-access",
        "Amazon-Advertising-API-ClientId": "ads-client",
        "Amazon-Advertising-API-Scope": "987654321",
        "Content-Type": "application/vnd.createasyncreportrequest.v3+json",
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      }
    }));
  });

  it("downloads and parses gzipped Amazon Ads report rows without authorization headers", async () => {
    const store = new MemoryCredentialStore();
    const reportRows = [
      { campaignId: "123", adGroupId: "456", searchTerm: "crochet keychain", clicks: 12, cost: 6.25, sales7d: 49.99, purchases7d: 1 },
      { campaignId: "123", adGroupId: "456", searchTerm: "free crochet pattern", clicks: 20, cost: 10.5, sales7d: 0, purchases7d: 0 }
    ];
    const fetchMock = vi.fn().mockResolvedValue(new Response(gzipSync(JSON.stringify(reportRows)), {
      status: 200,
      headers: { "content-type": "application/octet-stream" }
    }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.downloadReportRows("https://example.com/report.gz")).resolves.toEqual(reportRows);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/report.gz", { method: "GET" });
  });

  it("parses gzipped newline-delimited Amazon Ads report rows", async () => {
    const store = new MemoryCredentialStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(gzipSync([
      JSON.stringify({ campaignId: "123", searchTerm: "crochet bag charm" }),
      JSON.stringify({ campaignId: "123", searchTerm: "cute keychain" })
    ].join("\n")), { status: 200 }));
    const client = new AmazonAdsClient(store, fetchMock);

    await expect(client.downloadReportRows("https://example.com/report.gz")).resolves.toEqual([
      { campaignId: "123", searchTerm: "crochet bag charm" },
      { campaignId: "123", searchTerm: "cute keychain" }
    ]);
  });
});
