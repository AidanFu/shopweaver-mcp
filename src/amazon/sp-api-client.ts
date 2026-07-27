import { ShopWeaverError } from "../errors.js";
import type { CredentialStore } from "../credentials/types.js";
import { AmazonSpApiOAuth } from "./sp-api-oauth.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const REGION_ENDPOINTS = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com"
} as const;

export class AmazonSpApiClient {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly oauth = new AmazonSpApiOAuth(store, fetchImpl)
  ) {}

  async getMarketplaceParticipations() {
    return this.request("/sellers/v1/marketplaceParticipations");
  }

  private async request(path: string): Promise<unknown> {
    const auth = await this.store.get("amazonSpApiAuth");
    if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    const accessToken = auth.accessToken && auth.expiresAt && auth.expiresAt > Date.now() + 60_000
      ? auth.accessToken
      : (await this.oauth.refreshAccessToken()).accessToken;
    const endpoint = REGION_ENDPOINTS[auth.region];
    const url = `${endpoint}${path}`;
    const host = new URL(endpoint).host;
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        host,
        "x-amz-access-token": accessToken,
        "x-amz-date": amazonDate(new Date()),
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      }
    });
    if (!response.ok) throw new ShopWeaverError("AMAZON_SP_API_REQUEST_FAILED", "Amazon SP-API request failed.");
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return response.json();
    return response.arrayBuffer();
  }
}

function amazonDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
