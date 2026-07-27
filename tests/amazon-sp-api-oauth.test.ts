import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { AmazonSpApiOAuth } from "../src/amazon/sp-api-oauth.js";

describe("AmazonSpApiOAuth", () => {
  it("exchanges the stored refresh token for an LWA access token without exposing secrets in errors", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonSpApiApp", { clientId: "client", clientSecret: "secret" });
    await store.set("amazonSpApiAuth", {
      refreshToken: "refresh",
      sellingPartnerId: "A1SELLER",
      region: "na",
      marketplaceIds: ["ATVPDKIKX0DER"]
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access",
      token_type: "bearer",
      expires_in: 3600
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const oauth = new AmazonSpApiOAuth(store, fetchMock, () => 1_000);

    await expect(oauth.refreshAccessToken()).resolves.toEqual({
      accessToken: "access",
      expiresAt: 3_601_000
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.amazon.com/auth/o2/token", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "grant_type=refresh_token&refresh_token=refresh&client_id=client&client_secret=secret"
    }));
  });

  it("fails safely when Amazon SP-API credentials are missing", async () => {
    const oauth = new AmazonSpApiOAuth(new MemoryCredentialStore(), vi.fn());
    await expect(oauth.refreshAccessToken()).rejects.toMatchObject({ code: "AMAZON_SP_API_AUTH_REQUIRED" });
  });
});
