import { describe, expect, it } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";

describe("MemoryCredentialStore", () => {
  it("round-trips records through serialization", async () => {
    const store = new MemoryCredentialStore();
    const value = { accessToken: "secret", refreshToken: "refresh", expiresAt: 10, scopes: ["shops_r"] };
    await store.set("oauth", value);
    expect(await store.get("oauth")).toEqual(value);
  });

  it("returns copies rather than mutable stored references", async () => {
    const store = new MemoryCredentialStore();
    const value = { userId: 1, shopId: 2 };
    await store.set("shop", value);
    value.shopId = 3;
    expect(await store.get("shop")).toEqual({ userId: 1, shopId: 2 });
  });

  it("deletes records", async () => {
    const store = new MemoryCredentialStore();
    await store.set("shop", { userId: 1, shopId: 2 });
    await store.delete("shop");
    expect(await store.get("shop")).toBeNull();
  });
});
