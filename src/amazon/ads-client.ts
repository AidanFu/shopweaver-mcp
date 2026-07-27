import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import { AmazonAdsOAuth } from "./ads-oauth.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const ADS_ENDPOINTS = {
  na: "https://advertising-api.amazon.com",
  eu: "https://advertising-api-eu.amazon.com",
  fe: "https://advertising-api-fe.amazon.com"
} as const;

export class AmazonAdsClient {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly oauth = new AmazonAdsOAuth(store, fetchImpl)
  ) {}

  async listProfiles() {
    return this.request("/v2/profiles");
  }

  private async request(path: string): Promise<unknown> {
    const [app, auth] = await Promise.all([this.store.get("amazonAdsApp"), this.store.get("amazonAdsAuth")]);
    if (!app || !auth) throw new ShopWeaverError("AMAZON_ADS_AUTH_REQUIRED", "Connect Amazon Ads API before using Amazon advertising tools.");
    const accessToken = auth.accessToken && auth.expiresAt && auth.expiresAt > Date.now() + 60_000
      ? auth.accessToken
      : (await this.oauth.refreshAccessToken()).accessToken;
    const response = await this.fetchImpl(`${ADS_ENDPOINTS[auth.region]}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Amazon-Advertising-API-ClientId": app.clientId,
        "user-agent": "ShopWeaver/0.1.0 (Language=TypeScript)"
      }
    });
    if (!response.ok) throw new ShopWeaverError("AMAZON_ADS_REQUEST_FAILED", "Amazon Ads API request failed.");
    return response.json();
  }
}
