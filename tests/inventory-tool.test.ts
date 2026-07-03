import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { DraftWriteService, type InventoryInput } from "../src/tools/write-tools.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";

const inventory: InventoryInput = {
  products: [{
    sku: "BLUE-LARGE-MATTE",
    propertyValues: [
      { propertyId: 1, valueIds: [1], values: ["Blue"] },
      { propertyId: 2, valueIds: [2], values: ["Large"] },
      { propertyId: 3, valueIds: [3], values: ["Matte"] }
    ],
    offerings: [{ quantity: 2, enabled: true, price: "19.95" }]
  }]
};

async function service() {
  const store = new MemoryCredentialStore();
  await store.set("shop", { userId: 1, shopId: 42 });
  const client = { request: vi.fn().mockResolvedValue({ products: [{ product_id: 4, sku: inventory.products[0].sku, property_values: inventory.products[0].propertyValues.map(value => ({ property_id: value.propertyId, value_ids: value.valueIds, values: value.values })), offerings: [{ quantity: 2, is_enabled: true, price: { amount: 1995, divisor: 100, currency_code: "USD" } }] }] }) };
  const listings = { getListingState: vi.fn().mockResolvedValue("draft"), getListingInventory: vi.fn().mockResolvedValue({ products: [] }) };
  return { client, listings, writes: new DraftWriteService(client as never, listings as never, store, new ConfirmationStore()) };
}

describe("draft inventory updates", () => {
  it("previews complete three-dimension inventory without writing", async () => {
    const { writes, client } = await service();
    const preview = await writes.previewInventory(9, inventory);
    expect(preview.changes.products[0].propertyValues).toHaveLength(3);
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rechecks state and sends one non-retried PUT", async () => {
    const { writes, client, listings } = await service();
    const preview = await writes.previewInventory(9, inventory);
    const result = await writes.confirmInventory(9, inventory, preview.confirmationToken);
    expect(listings.getListingState).toHaveBeenCalledTimes(2);
    expect(client.request).toHaveBeenCalledOnce();
    expect(client.request.mock.calls[0][0]).toContain("max_variations_supported=3");
    expect(client.request.mock.calls[0][1].method).toBe("PUT");
    expect(result.products[0].propertyValues).toHaveLength(3);
  });
});
