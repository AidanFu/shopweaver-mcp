import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { GoogleClient } from "../src/google/client.js";

async function storeWithGoogle() {
  const store = new MemoryCredentialStore();
  await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost/google" });
  await store.set("google", { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 120_000, scopes: ["https://www.googleapis.com/auth/drive.file"] });
  return store;
}

describe("GoogleClient", () => {
  it("sends bearer authorization and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "folder", name: "HandMade" }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new GoogleClient(await storeWithGoogle(), fetchMock);
    await expect(client.request("/drive/v3/files/folder")).resolves.toEqual({ id: "folder", name: "HandMade" });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer access");
  });

  it("does not return token values in errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "bad access" }), { status: 403 }));
    const client = new GoogleClient(await storeWithGoogle(), fetchMock);
    await expect(client.request("/drive/v3/files/folder")).rejects.toMatchObject({ code: "GOOGLE_REQUEST_FAILED" });
    await expect(client.request("/drive/v3/files/folder")).rejects.not.toThrow("access");
  });
});
