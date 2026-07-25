import { GOOGLE_API_BASE_URL } from "../config.js";
import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import { GoogleOAuth } from "./oauth.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class GoogleClient {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly oauth = new GoogleOAuth(store, fetchImpl)
  ) {}

  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const app = await this.store.get("googleApp");
    let google = await this.store.get("google");
    if (!app || !google) throw new ShopWeaverError("GOOGLE_AUTH_REQUIRED", "Connect Google Drive before using this tool.");
    if (google.expiresAt <= Date.now() + 60_000) google = await this.oauth.refresh(app, google);
    const headers = { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${google.accessToken}` };
    const response = await this.fetchImpl(`${GOOGLE_API_BASE_URL}${path}`, { ...init, headers });
    if (!response.ok) throw new ShopWeaverError("GOOGLE_REQUEST_FAILED", "Google Drive request failed.");
    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return response.json();
    return response.arrayBuffer();
  }
}
