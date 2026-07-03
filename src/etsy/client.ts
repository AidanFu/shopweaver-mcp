import type { z } from "zod";
import { ETSY_API_BASE_URL } from "../config.js";
import type { CredentialStore, StoredRecords } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import { EtsyOAuth } from "../oauth/etsy-oauth.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;
type Refresh = (app: StoredRecords["app"], oauth: StoredRecords["oauth"]) => Promise<StoredRecords["oauth"]>;

type ClientOptions = {
  store: CredentialStore;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  now?: () => number;
  refresh?: Refresh;
};

const defaultSleep: Sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export class EtsyClient {
  private readonly store: CredentialStore;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: Sleep;
  private readonly now: () => number;
  private readonly refresh: Refresh;
  private refreshInFlight?: Promise<StoredRecords["oauth"]>;

  constructor(options: ClientOptions) {
    this.store = options.store;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.refresh = options.refresh ?? ((app, oauth) => new EtsyOAuth(this.store, this.fetchImpl, this.now).refresh(app, oauth));
  }

  private async credentials(): Promise<{ app: StoredRecords["app"]; oauth: StoredRecords["oauth"] }> {
    const app = await this.store.get("app");
    let oauth = await this.store.get("oauth");
    if (!app || !oauth) throw new ShopWeaverError("AUTH_REQUIRED", "Connect an Etsy account before using ShopWeaver.");
    if (oauth.expiresAt <= this.now() + 60_000) {
      this.refreshInFlight ??= this.refresh(app, oauth).finally(() => { this.refreshInFlight = undefined; });
      oauth = await this.refreshInFlight;
    }
    return { app, oauth };
  }

  async request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const { app, oauth } = await this.credentials();
    const method = (init.method ?? "GET").toUpperCase();
    const delays = [250, 750];
    let attempt = 0;
    while (true) {
      let response: Response;
      try {
        const headers = new Headers(init.headers);
        headers.set("x-api-key", `${app.keystring}:${app.sharedSecret}`);
        headers.set("authorization", `Bearer ${oauth.accessToken}`);
        response = await this.fetchImpl(`${ETSY_API_BASE_URL}${path}`, { ...init, method, headers });
      } catch (error) {
        if (method === "GET" && attempt < delays.length) {
          await this.sleep(delays[attempt++]);
          continue;
        }
        throw new ShopWeaverError("ETSY_REQUEST_FAILED", "Etsy could not be reached.", error);
      }
      if (response.status === 401) throw new ShopWeaverError("AUTH_REQUIRED", "Etsy authorization expired; reconnect the account.");
      const transient = response.status === 429 || [502, 503, 504].includes(response.status);
      if (method === "GET" && transient && attempt < delays.length) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1000, 60_000) : delays[attempt];
        attempt += 1;
        await this.sleep(delay);
        continue;
      }
      if (!response.ok) {
        const code = response.status === 429 ? "RATE_LIMITED" : "ETSY_REQUEST_FAILED";
        throw new ShopWeaverError(code, response.status === 429 ? "Etsy rate limit reached; retry later." : `Etsy request failed with status ${response.status}.`);
      }
      try {
        return schema.parse(await response.json());
      } catch (error) {
        throw new ShopWeaverError("ETSY_RESPONSE_INVALID", "Etsy returned an unexpected response.", error);
      }
    }
  }
}
