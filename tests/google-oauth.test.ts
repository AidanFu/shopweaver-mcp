import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { GoogleOAuth } from "../src/google/oauth.js";

describe("GoogleOAuth", () => {
  it("builds an authorization URL with Drive file scope", () => {
    const oauth = new GoogleOAuth(new MemoryCredentialStore(), vi.fn());
    const authorization = oauth.createAuthorization("client-id", "http://localhost:3004/google/redirect");
    expect(authorization.url.origin).toBe("https://accounts.google.com");
    expect(authorization.url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/drive.file");
    expect(authorization.url.searchParams.get("access_type")).toBe("offline");
    expect(authorization.state.length).toBeGreaterThan(20);
  });

  it("exchanges a code and stores Google tokens", async () => {
    const store = new MemoryCredentialStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "google-access",
      refresh_token: "google-refresh",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/drive.file"
    }), { status: 200 }));
    const oauth = new GoogleOAuth(store, fetchMock, () => 1_000);
    await oauth.exchangeCode({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3004/google/redirect"
    }, "code");
    expect(await store.get("google")).toMatchObject({
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: 3_601_000
    });
  });
});
