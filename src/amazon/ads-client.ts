import { gunzipSync } from "node:zlib";
import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import { AmazonAdsOAuth } from "./ads-oauth.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface SponsoredProductsSearchTermReportInput {
  name: string;
  startDate: string;
  endDate: string;
  timeUnit: "SUMMARY" | "DAILY";
  keywordType: Array<"BROAD" | "PHRASE" | "EXACT" | "TARGETING_EXPRESSION" | "TARGETING_EXPRESSION_PREDEFINED">;
}

interface SponsoredProductsAdvertisedProductReportInput {
  name: string;
  startDate: string;
  endDate: string;
  timeUnit: "SUMMARY" | "DAILY";
}

interface SponsoredProductsNegativeKeywordInput {
  campaignId: string;
  adGroupId: string;
  keywordText: string;
  matchType: "NEGATIVE_EXACT" | "NEGATIVE_PHRASE" | "NEGATIVE_BROAD";
  state: "ENABLED";
}

interface SponsoredProductsCampaignUpdateInput {
  campaignId: string;
  state?: "ENABLED" | "PAUSED" | "ARCHIVED";
  budget?: { budgetType: "DAILY"; budget: number };
  dynamicBidding?: {
    strategy: "AUTO_FOR_SALES" | "LEGACY_FOR_SALES" | "MANUAL";
    placementBidding: Array<{ placement: string; percentage: number }>;
  };
}

interface SponsoredProductsCampaignCreateInput {
  name: string;
  targetingType: "AUTO" | "MANUAL";
  state: "ENABLED" | "PAUSED";
  startDate: string;
  budget: { budgetType: "DAILY"; budget: number };
  dynamicBidding: {
    strategy: "AUTO_FOR_SALES" | "LEGACY_FOR_SALES" | "MANUAL";
    placementBidding: Array<{ placement: string; percentage: number }>;
  };
}

interface SponsoredProductsKeywordUpdateInput {
  keywordId: string;
  bid?: number;
  state?: "ENABLED" | "PAUSED" | "ARCHIVED";
}

interface SponsoredProductsAdGroupUpdateInput {
  adGroupId: string;
  defaultBid?: number;
  state?: "ENABLED" | "PAUSED" | "ARCHIVED";
}

const ADS_ENDPOINTS = {
  na: "https://advertising-api.amazon.com",
  eu: "https://advertising-api-eu.amazon.com",
  fe: "https://advertising-api-fe.amazon.com"
} as const;

export class AmazonAdsClient {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly oauth = new AmazonAdsOAuth(store, fetchImpl),
    private readonly timeoutMs = 30_000
  ) {}

  async listProfiles() {
    return this.request("/v2/profiles");
  }

  async listSponsoredProductsCampaigns(profileId: string, body: Record<string, unknown> = {}) {
    return this.request("/sp/campaigns/list", {
      method: "POST",
      profileId,
      accept: "application/vnd.spCampaign.v3+json",
      contentType: "application/vnd.spCampaign.v3+json",
      body
    });
  }

  async updateSponsoredProductsCampaigns(profileId: string, campaigns: SponsoredProductsCampaignUpdateInput[]) {
    return this.request("/sp/campaigns", {
      method: "PUT",
      profileId,
      accept: "application/vnd.spCampaign.v3+json",
      contentType: "application/vnd.spCampaign.v3+json",
      body: { campaigns }
    });
  }

  async createSponsoredProductsCampaigns(profileId: string, campaigns: SponsoredProductsCampaignCreateInput[]) {
    return this.request("/sp/campaigns", {
      method: "POST",
      profileId,
      accept: "application/vnd.spCampaign.v3+json",
      contentType: "application/vnd.spCampaign.v3+json",
      body: { campaigns }
    });
  }

  async listSponsoredProductsAdGroups(profileId: string, body: Record<string, unknown> = {}) {
    return this.request("/sp/adGroups/list", {
      method: "POST",
      profileId,
      accept: "application/vnd.spAdGroup.v3+json",
      contentType: "application/vnd.spAdGroup.v3+json",
      body
    });
  }

  async updateSponsoredProductsAdGroups(profileId: string, adGroups: SponsoredProductsAdGroupUpdateInput[]) {
    return this.request("/sp/adGroups", {
      method: "PUT",
      profileId,
      accept: "application/vnd.spAdGroup.v3+json",
      contentType: "application/vnd.spAdGroup.v3+json",
      body: { adGroups }
    });
  }

  async listSponsoredProductsKeywords(profileId: string, body: Record<string, unknown> = {}) {
    return this.request("/sp/keywords/list", {
      method: "POST",
      profileId,
      accept: "application/vnd.spKeyword.v3+json",
      contentType: "application/vnd.spKeyword.v3+json",
      body
    });
  }

  async updateSponsoredProductsKeywords(profileId: string, keywords: SponsoredProductsKeywordUpdateInput[]) {
    return this.request("/sp/keywords", {
      method: "PUT",
      profileId,
      accept: "application/vnd.spKeyword.v3+json",
      contentType: "application/vnd.spKeyword.v3+json",
      body: { keywords }
    });
  }

  async createSponsoredProductsNegativeKeywords(profileId: string, negativeKeywords: SponsoredProductsNegativeKeywordInput[]) {
    return this.request("/sp/negativeKeywords", {
      method: "POST",
      profileId,
      accept: "application/vnd.spNegativeKeyword.v3+json",
      contentType: "application/vnd.spNegativeKeyword.v3+json",
      body: { negativeKeywords }
    });
  }

  async createSponsoredProductsSearchTermReport(profileId: string, input: SponsoredProductsSearchTermReportInput) {
    return this.request("/reporting/reports", {
      method: "POST",
      profileId,
      contentType: "application/vnd.createasyncreportrequest.v3+json",
      body: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        configuration: {
          adProduct: "SPONSORED_PRODUCTS",
          groupBy: ["searchTerm"],
          columns: ["impressions", "clicks", "cost", "campaignId", "campaignName", "adGroupId", "adGroupName", "startDate", "endDate", "keywordType", "keyword", "matchType", "keywordId", "searchTerm", "sales7d", "purchases7d", "acosClicks7d", "roasClicks7d"],
          filters: [{ field: "keywordType", values: input.keywordType }],
          reportTypeId: "spSearchTerm",
          timeUnit: input.timeUnit,
          format: "GZIP_JSON"
        }
      }
    });
  }

  async createSponsoredProductsAdvertisedProductReport(profileId: string, input: SponsoredProductsAdvertisedProductReportInput) {
    return this.request("/reporting/reports", {
      method: "POST",
      profileId,
      contentType: "application/vnd.createasyncreportrequest.v3+json",
      body: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        configuration: {
          adProduct: "SPONSORED_PRODUCTS",
          groupBy: ["advertiser"],
          columns: ["impressions", "clicks", "cost", "campaignId", "campaignName", "adGroupId", "adGroupName", "startDate", "endDate", "advertisedAsin", "advertisedSku", "sales7d", "purchases7d", "attributedSalesSameSku7d", "unitsSoldSameSku7d", "acosClicks7d", "roasClicks7d"],
          reportTypeId: "spAdvertisedProduct",
          timeUnit: input.timeUnit,
          format: "GZIP_JSON"
        }
      }
    });
  }

  async getReport(profileId: string, reportId: string) {
    return this.request(`/reporting/reports/${encodeURIComponent(reportId)}`, {
      profileId,
      contentType: "application/vnd.createasyncreportrequest.v3+json"
    });
  }

  async downloadReportRows(url: string): Promise<Array<Record<string, unknown>>> {
    const controller = new AbortController();
    let response: Response;
    try {
      response = await withTimeout(this.fetchImpl(url, { method: "GET", signal: controller.signal }), this.timeoutMs, "AMAZON_ADS_REPORT_DOWNLOAD_TIMEOUT", "Amazon Ads report download timed out.", controller);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ShopWeaverError("AMAZON_ADS_REPORT_DOWNLOAD_TIMEOUT", "Amazon Ads report download timed out.", error);
      }
      throw error;
    }
    if (!response.ok) throw new ShopWeaverError("AMAZON_ADS_REPORT_DOWNLOAD_FAILED", "Amazon Ads report download failed.");
    return parseGzipJsonRows(new Uint8Array(await withTimeout(response.arrayBuffer(), this.timeoutMs, "AMAZON_ADS_REPORT_DOWNLOAD_TIMEOUT", "Amazon Ads report download timed out.", controller)));
  }

  private async request(path: string, options: {
    method?: "GET" | "POST" | "PUT";
    profileId?: string;
    accept?: string;
    contentType?: string;
    body?: Record<string, unknown>;
  } = {}): Promise<unknown> {
    const [app, auth] = await Promise.all([this.store.get("amazonAdsApp"), this.store.get("amazonAdsAuth")]);
    if (!app || !auth) throw new ShopWeaverError("AMAZON_ADS_AUTH_REQUIRED", "Connect Amazon Ads API before using Amazon advertising tools.");
    const accessToken = auth.accessToken && auth.expiresAt && auth.expiresAt > Date.now() + 60_000
      ? auth.accessToken
      : (await this.oauth.refreshAccessToken()).accessToken;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Amazon-Advertising-API-ClientId": app.clientId,
      "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
    };
    if (options.profileId) headers["Amazon-Advertising-API-Scope"] = options.profileId;
    if (options.accept) headers.Accept = options.accept;
    if (options.contentType) headers["Content-Type"] = options.contentType;
    const controller = new AbortController();
    let response: Response;
    try {
      response = await withTimeout(this.fetchImpl(`${ADS_ENDPOINTS[auth.region]}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      }), this.timeoutMs, "AMAZON_ADS_REQUEST_TIMEOUT", "Amazon Ads API request timed out.", controller);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ShopWeaverError("AMAZON_ADS_REQUEST_TIMEOUT", "Amazon Ads API request timed out.", error);
      }
      throw error;
    }
    if (!response.ok) throw new ShopWeaverError("AMAZON_ADS_REQUEST_FAILED", "Amazon Ads API request failed.");
    return withTimeout(response.json(), this.timeoutMs, "AMAZON_ADS_REQUEST_TIMEOUT", "Amazon Ads API request timed out.", controller);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string, message: string, controller: AbortController): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new ShopWeaverError(code, message));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseGzipJsonRows(bytes: Uint8Array): Array<Record<string, unknown>> {
  const text = gunzipSync(bytes).toString("utf8").trim();
  if (!text) return [];
  const parsed = text.startsWith("[")
    ? JSON.parse(text)
    : text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  return [parsed as Record<string, unknown>];
}
