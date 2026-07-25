import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { ListingService } from "../src/etsy/listings.js";
import { InventorySchema } from "../src/etsy/schemas.js";
import { connectionStatus } from "../src/tools/read-tools.js";

async function storeWithShop() {
  const store = new MemoryCredentialStore();
  await store.set("app", { keystring: "key", sharedSecret: "secret", redirectUri: "http://localhost/callback" });
  await store.set("oauth", { accessToken: "1.token", refreshToken: "1.refresh", expiresAt: 100, scopes: ["shops_r"] });
  await store.set("shop", { userId: 1, shopId: 42 });
  return store;
}

describe("read services", () => {
  it("reports connection state without secret values", async () => {
    const result = await connectionStatus(await storeWithShop());
    expect(result).toEqual({ credentialsAvailable: true, authorized: true, shopConnected: true, scopes: ["shops_r"] });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("uses the connected shop and maps shop fields", async () => {
    const request = vi.fn().mockResolvedValue({ shop_id: 42, shop_name: "Studio", title: "Made things", currency_code: "USD", active_listing_count: 3 });
    const service = new ListingService({ request } as never, await storeWithShop());
    await expect(service.getShop()).resolves.toEqual({ shopId: 42, name: "Studio", title: "Made things", currency: "USD", activeListingCount: 3 });
    expect(request.mock.calls[0][0]).toBe("/application/shops/42");
  });

  it("maps Etsy's live shop active listing count field", async () => {
    const request = vi.fn().mockResolvedValue({ shop_id: 42, shop_name: "Studio", title: null, currency_code: "USD", listing_active_count: 0 });
    const service = new ListingService({ request } as never, await storeWithShop());
    await expect(service.getShop()).resolves.toMatchObject({ activeListingCount: 0 });
  });

  it("lists connected-shop listings with bounded pagination", async () => {
    const request = vi.fn().mockResolvedValue({ count: 1, results: [{ shop_id: 42, listing_id: 7, title: "Bowl", state: "draft", quantity: 2, price: { amount: 1250, divisor: 100, currency_code: "USD" } }] });
    const service = new ListingService({ request } as never, await storeWithShop());
    const result = await service.listListings({ state: "draft", limit: 500, offset: 0 });
    expect(result.results[0]).toEqual({ listingId: 7, title: "Bowl", state: "draft", quantity: 2, price: { amount: "12.50", currency: "USD" } });
    expect(request.mock.calls[0][0]).toContain("limit=100");
  });

  it("preserves three inventory property dimensions", async () => {
    const request = vi.fn().mockResolvedValue({ products: [{ product_id: 1, sku: "ABC", property_values: [
      { property_id: 1, property_name: "Color", values: ["Blue"], value_ids: [1] },
      { property_id: 2, property_name: "Size", values: ["Large"], value_ids: [2] },
      { property_id: 3, property_name: "Finish", values: ["Matte"], value_ids: [3] }
    ], offerings: [] }] });
    const service = new ListingService({ request } as never, await storeWithShop());
    const inventory = await service.getListingInventory(7);
    expect(inventory.products[0].propertyValues).toHaveLength(3);
    expect(request.mock.calls[0][0]).toContain("max_variations_supported=3");
  });

  it("accepts null readiness state in listing inventory", async () => {
    const inventory = InventorySchema.parse({ products: [{ product_id: 1, sku: "ABC", property_values: [], offerings: [{ quantity: 1, is_enabled: true, readiness_state_id: null }] }] });
    expect(inventory.products[0].offerings[0].readiness_state_id).toBeNull();
  });

  it("rejects a listing outside the connected shop", async () => {
    const request = vi.fn().mockResolvedValue({ shop_id: 99, listing_id: 7, title: "Other", state: "draft", quantity: 1, price: { amount: 100, divisor: 100, currency_code: "USD" } });
    const service = new ListingService({ request } as never, await storeWithShop());
    await expect(service.getListingState(7)).rejects.toMatchObject({ code: "LISTING_NOT_IN_SHOP" });
  });
});
