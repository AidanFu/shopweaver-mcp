import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { EtsyClient } from "../src/etsy/client.js";

async function connectedStore(expiresAt = 100_000) {
  const store = new MemoryCredentialStore();
  await store.set("app", { keystring: "key", sharedSecret: "shared", redirectUri: "http://localhost/callback" });
  await store.set("oauth", { accessToken: "1.access", refreshToken: "1.refresh", expiresAt, scopes: ["shops_r"] });
  await store.set("shop", { userId: 1, shopId: 2 });
  return store;
}

describe("EtsyClient", () => {
  it("adds API key and bearer headers", async () => {
    const store = await connectedStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new EtsyClient({ store, fetchImpl: fetchMock, now: () => 1_000 });
    await client.request("/application/test", {}, z.object({ ok: z.boolean() }));
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("x-api-key")).toBe("key:shared");
    expect(headers.get("authorization")).toBe("Bearer 1.access");
  });

  it("refreshes once when the token expires within sixty seconds", async () => {
    const store = await connectedStore(50_000);
    const refresh = vi.fn().mockResolvedValue({ accessToken: "1.new", refreshToken: "1.new-refresh", expiresAt: 500_000, scopes: ["shops_r"] });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new EtsyClient({ store, fetchImpl: fetchMock, now: () => 1_000, refresh });
    await client.request("/application/test", {}, z.object({ ok: z.boolean() }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBe("Bearer 1.new");
  });

  it("retries GET on rate limits but not POST", async () => {
    const store = await connectedStore();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchGet = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const getClient = new EtsyClient({ store, fetchImpl: fetchGet, sleep, now: () => 1_000 });
    await getClient.request("/application/test", {}, z.object({ ok: z.boolean() }));
    expect(fetchGet).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);

    const fetchPost = vi.fn().mockResolvedValue(new Response("{}", { status: 503 }));
    const postClient = new EtsyClient({ store, fetchImpl: fetchPost, sleep, now: () => 1_000 });
    await expect(postClient.request("/application/test", { method: "POST" }, z.object({ ok: z.boolean() })))
      .rejects.toMatchObject({ code: "ETSY_REQUEST_FAILED" });
    expect(fetchPost).toHaveBeenCalledOnce();
  });

  it("maps unauthorized and invalid responses to public errors", async () => {
    const store = await connectedStore();
    const unauthorized = new EtsyClient({ store, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 401 })), now: () => 1_000 });
    await expect(unauthorized.request("/application/test", {}, z.object({ ok: z.boolean() })))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    const invalid = new EtsyClient({ store, fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ wrong: true }), { status: 200 })), now: () => 1_000 });
    await expect(invalid.request("/application/test", {}, z.object({ ok: z.boolean() })))
      .rejects.toMatchObject({ code: "ETSY_RESPONSE_INVALID" });
  });
});
