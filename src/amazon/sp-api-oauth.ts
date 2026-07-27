import { ShopWeaverError } from "../errors.js";
import type { CredentialStore } from "../credentials/types.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const AMAZON_LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

export class AmazonSpApiOAuth {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now = Date.now
  ) {}

  async refreshAccessToken() {
    const app = await this.store.get("amazonSpApiApp");
    const auth = await this.store.get("amazonSpApiAuth");
    if (!app || !auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: auth.refreshToken,
      client_id: app.clientId,
      client_secret: app.clientSecret
    }).toString();
    const response = await this.fetchImpl(AMAZON_LWA_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body
    });
    if (!response.ok) throw new ShopWeaverError("AMAZON_SP_API_AUTH_FAILED", "Amazon SP-API authorization failed; refresh the seller authorization.");
    const token = await response.json() as { access_token?: string; expires_in?: number };
    if (!token.access_token || !token.expires_in) throw new ShopWeaverError("AMAZON_SP_API_AUTH_FAILED", "Amazon SP-API authorization response was invalid.");
    const updated = {
      ...auth,
      accessToken: token.access_token,
      expiresAt: this.now() + token.expires_in * 1000
    };
    await this.store.set("amazonSpApiAuth", updated);
    return { accessToken: updated.accessToken, expiresAt: updated.expiresAt };
  }
}
