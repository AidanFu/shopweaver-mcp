import { z } from "zod";
import { ETSY_API_BASE_URL, ETSY_SCOPES } from "../config.js";
import type { CredentialStore, StoredRecords } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import { registerSecret } from "../redaction.js";
import { createPkce } from "./pkce.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const TokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive()
}).strip();

const ShopIdSchema = z.object({ shop_id: z.number().int().positive() }).strip();
const ShopsSchema = z.union([z.object({ results: z.array(ShopIdSchema) }).strip(), ShopIdSchema]);

export class EtsyOAuth {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now
  ) {}

  createAuthorization(keystring: string, redirectUri: string) {
    const pkce = createPkce();
    const url = new URL("https://www.etsy.com/oauth/connect");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: keystring,
      redirect_uri: redirectUri,
      scope: ETSY_SCOPES.join(" "),
      state: pkce.state,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256"
    }).toString();
    return { ...pkce, url };
  }

  async exchangeCode(app: StoredRecords["app"], verifier: string, code: string): Promise<{ userId: number }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: app.keystring,
      redirect_uri: app.redirectUri,
      code,
      code_verifier: verifier
    });
    const response = await this.fetchImpl(`${ETSY_API_BASE_URL}/public/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new ShopWeaverError("OAUTH_EXCHANGE_FAILED", "Etsy authorization failed; reconnect the account.");
    const token = TokenSchema.parse(await response.json());
    registerSecret(token.access_token);
    registerSecret(token.refresh_token);
    const userId = Number(token.access_token.split(".", 1)[0]);
    if (!Number.isSafeInteger(userId) || userId < 1) throw new ShopWeaverError("OAUTH_TOKEN_INVALID", "Etsy returned an invalid authorization token.");
    await this.store.set("oauth", {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: this.now() + token.expires_in * 1000,
      scopes: [...ETSY_SCOPES]
    });
    return { userId };
  }

  async refresh(app: StoredRecords["app"], oauth: StoredRecords["oauth"]): Promise<StoredRecords["oauth"]> {
    const response = await this.fetchImpl(`${ETSY_API_BASE_URL}/public/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: app.keystring, refresh_token: oauth.refreshToken })
    });
    if (!response.ok) throw new ShopWeaverError("AUTH_REQUIRED", "Etsy authorization expired; reconnect the account.");
    const token = TokenSchema.parse(await response.json());
    const updated = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: this.now() + token.expires_in * 1000,
      scopes: oauth.scopes
    };
    await this.store.set("oauth", updated);
    return updated;
  }

  async discoverSingleShop(app: StoredRecords["app"], accessToken: string, userId: number): Promise<number> {
    const response = await this.fetchImpl(`${ETSY_API_BASE_URL}/application/users/${userId}/shops`, {
      headers: { "x-api-key": `${app.keystring}:${app.sharedSecret}`, authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new ShopWeaverError("SHOP_LOOKUP_FAILED", "Could not find the Etsy shop for this account.");
    const parsed = ShopsSchema.parse(await response.json());
    const shops = "results" in parsed ? parsed.results : [parsed];
    if (shops.length !== 1) throw new ShopWeaverError("ONE_SHOP_REQUIRED", "ShopWeaver requires an Etsy account with exactly one shop.");
    return shops[0].shop_id;
  }
}
