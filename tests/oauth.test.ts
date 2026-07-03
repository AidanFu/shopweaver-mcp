import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ETSY_SCOPES } from "../src/config.js";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { createPkce } from "../src/oauth/pkce.js";
import { waitForOAuthCallback } from "../src/oauth/callback.js";
import { EtsyOAuth } from "../src/oauth/etsy-oauth.js";

const closeCallbacks: Array<() => void> = [];
afterEach(() => closeCallbacks.splice(0).forEach(close => close()));

async function openPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("missing address"));
      server.close(() => resolve(address.port));
    });
  });
}

describe("OAuth", () => {
  it("creates an RFC 7636 S256 challenge", () => {
    const value = createPkce();
    expect(value.challenge).toBe(createHash("sha256").update(value.verifier).digest("base64url"));
    expect(value.state.length).toBeGreaterThan(20);
  });

  it("builds an authorization URL with only the fixed scopes", () => {
    const oauth = new EtsyOAuth(new MemoryCredentialStore(), vi.fn());
    const authorization = oauth.createAuthorization("key", "http://localhost:3003/oauth/redirect");
    expect(authorization.url.searchParams.get("scope")).toBe(ETSY_SCOPES.join(" "));
    expect(authorization.url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("exchanges a code and stores expiry and user id", async () => {
    const store = new MemoryCredentialStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "12345.access",
      refresh_token: "12345.refresh",
      token_type: "Bearer",
      expires_in: 3600
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const oauth = new EtsyOAuth(store, fetchMock, () => 1_000);
    const result = await oauth.exchangeCode({
      keystring: "key",
      sharedSecret: "secret",
      redirectUri: "http://localhost:3003/oauth/redirect"
    }, "verifier", "code");
    expect(result.userId).toBe(12345);
    expect(await store.get("oauth")).toEqual({
      accessToken: "12345.access",
      refreshToken: "12345.refresh",
      expiresAt: 3_601_000,
      scopes: [...ETSY_SCOPES]
    });
    expect(fetchMock.mock.calls[0][1].body.toString()).toContain("code_verifier=verifier");
  });

  it("rejects a callback whose state does not match", async () => {
    const port = await openPort();
    const callback = waitForOAuthCallback(new URL(`http://127.0.0.1:${port}/oauth/redirect`), "expected", 1_000);
    const response = await fetch(`http://127.0.0.1:${port}/oauth/redirect?code=value&state=wrong`);
    expect(response.status).toBe(400);
    await expect(callback).rejects.toMatchObject({ code: "OAUTH_STATE_MISMATCH" });
  });
});
