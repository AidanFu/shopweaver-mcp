import { randomBytes } from "node:crypto";
import { z } from "zod";
import { GOOGLE_OAUTH_BASE_URL, GOOGLE_SCOPES, GOOGLE_TOKEN_URL } from "../config.js";
import type { CredentialStore, StoredRecords } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import { registerSecret } from "../redaction.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const TokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string().optional()
}).strip();

export class GoogleOAuth {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now
  ) {}

  createAuthorization(clientId: string, redirectUri: string) {
    const state = randomBytes(32).toString("base64url");
    const url = new URL(GOOGLE_OAUTH_BASE_URL);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state
    }).toString();
    return { state, url };
  }

  async exchangeCode(app: StoredRecords["googleApp"], code: string): Promise<void> {
    const response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: app.redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!response.ok) throw new ShopWeaverError("GOOGLE_OAUTH_EXCHANGE_FAILED", "Google authorization failed; reconnect Google Drive.");
    const token = TokenSchema.parse(await response.json());
    registerSecret(token.access_token);
    if (token.refresh_token) registerSecret(token.refresh_token);
    await this.store.set("google", {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? "",
      expiresAt: this.now() + token.expires_in * 1000,
      scopes: token.scope?.split(" ") ?? [...GOOGLE_SCOPES]
    });
  }

  async refresh(app: StoredRecords["googleApp"], google: StoredRecords["google"]): Promise<StoredRecords["google"]> {
    const response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        refresh_token: google.refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) throw new ShopWeaverError("GOOGLE_AUTH_REQUIRED", "Google Drive authorization expired; reconnect Google Drive.");
    const token = TokenSchema.parse(await response.json());
    const updated = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? google.refreshToken,
      expiresAt: this.now() + token.expires_in * 1000,
      scopes: google.scopes
    };
    await this.store.set("google", updated);
    return updated;
  }
}
