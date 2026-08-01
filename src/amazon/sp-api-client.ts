import { ShopWeaverError } from "../errors.js";
import type { CredentialStore } from "../credentials/types.js";
import { AmazonSpApiOAuth } from "./sp-api-oauth.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const REGION_ENDPOINTS = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com"
} as const;

type RequestOptions = {
  method?: "GET" | "PATCH" | "POST";
  query?: Record<string, string>;
  body?: unknown;
};

type ListOrdersInput = {
  createdAfter: string;
  createdBefore?: string;
  marketplaceIds?: string[];
  orderStatuses?: string[];
  maxResultsPerPage?: number;
  nextToken?: string;
};

export class AmazonSpApiClient {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly oauth = new AmazonSpApiOAuth(store, fetchImpl),
    private readonly timeoutMs = 30_000
  ) {}

  async getMarketplaceParticipations() {
    return this.request("/sellers/v1/marketplaceParticipations");
  }

  async getListingItem(sku: string) {
    const auth = await this.store.get("amazonSpApiAuth");
    if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    return this.request(`/listings/2021-08-01/items/${encodeURIComponent(auth.sellingPartnerId)}/${encodeURIComponent(sku)}`, {
      query: {
        marketplaceIds: auth.marketplaceIds.join(","),
        includedData: "summaries,attributes,issues,offers,fulfillmentAvailability"
      }
    });
  }

  async listOrders(input: ListOrdersInput) {
    const auth = await this.store.get("amazonSpApiAuth");
    if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    return this.request("/orders/v0/orders", {
      query: {
        MarketplaceIds: (input.marketplaceIds ?? auth.marketplaceIds).join(","),
        CreatedAfter: input.createdAfter,
        ...(input.createdBefore ? { CreatedBefore: input.createdBefore } : {}),
        ...(input.orderStatuses?.length ? { OrderStatuses: input.orderStatuses.join(",") } : {}),
        ...(input.maxResultsPerPage ? { MaxResultsPerPage: String(input.maxResultsPerPage) } : {}),
        ...(input.nextToken ? { NextToken: input.nextToken } : {})
      }
    });
  }

  async getOrderItems(amazonOrderId: string) {
    return this.request(`/orders/v0/orders/${encodeURIComponent(amazonOrderId)}/orderItems`);
  }

  async patchListingItem(sku: string, body: unknown, options: { validationPreview?: boolean } = {}) {
    const auth = await this.store.get("amazonSpApiAuth");
    if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    return this.request(`/listings/2021-08-01/items/${encodeURIComponent(auth.sellingPartnerId)}/${encodeURIComponent(sku)}`, {
      method: "PATCH",
      query: {
        marketplaceIds: auth.marketplaceIds.join(","),
        includedData: "issues",
        ...(options.validationPreview ? { mode: "VALIDATION_PREVIEW", issueLocale: "en_US" } : {})
      },
      body
    });
  }

  async getAplusContentPublishRecords(asin: string) {
    const auth = await this.store.get("amazonSpApiAuth");
    if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    return this.request("/aplus/2020-11-01/contentPublishRecords", {
      query: {
        marketplaceId: auth.marketplaceIds[0],
        asin
      }
    });
  }

  async getAplusContentDocument(contentReferenceKey: string) {
    const auth = await this.store.get("amazonSpApiAuth");
    if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    return this.request(`/aplus/2020-11-01/contentDocuments/${encodeURIComponent(contentReferenceKey)}`, {
      query: {
        marketplaceId: auth.marketplaceIds[0],
        includedDataSet: "CONTENTS,METADATA"
      }
    });
  }

  async validateAplusContentDocument(asinSet: string[], contentDocument: unknown) {
    const auth = await this.store.get("amazonSpApiAuth");
    if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    return this.request("/aplus/2020-11-01/contentAsinValidations", {
      method: "POST",
      query: {
        marketplaceId: auth.marketplaceIds[0],
        asinSet: asinSet.join(",")
      },
      body: { contentDocument }
    });
  }

  private async request(path: string, options: RequestOptions = {}): Promise<unknown> {
    const auth = await this.store.get("amazonSpApiAuth");
    if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    const accessToken = auth.accessToken && auth.expiresAt && auth.expiresAt > Date.now() + 60_000
      ? auth.accessToken
      : (await this.oauth.refreshAccessToken()).accessToken;
    const endpoint = REGION_ENDPOINTS[auth.region];
    const url = options.query ? `${endpoint}${path}?${new URLSearchParams(options.query).toString()}` : `${endpoint}${path}`;
    const host = new URL(endpoint).host;
    const headers: Record<string, string> = {
      host,
      "x-amz-access-token": accessToken,
      "x-amz-date": amazonDate(new Date()),
      "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
    };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers,
        signal: controller.signal,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ShopWeaverError("AMAZON_SP_API_REQUEST_TIMEOUT", "Amazon SP-API request timed out.", error);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new ShopWeaverError("AMAZON_SP_API_REQUEST_FAILED", `Amazon SP-API request failed: ${await failureSummary(response)}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return response.json();
    return response.arrayBuffer();
  }
}

async function failureSummary(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return String(response.status);
  const body = await response.json() as { errors?: Array<{ code?: string; message?: string }> };
  const first = body.errors?.[0];
  return [String(response.status), first?.code, first?.message].filter(Boolean).join(" - ");
}

function amazonDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
