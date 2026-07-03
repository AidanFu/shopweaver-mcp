import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { OrderService } from "../src/etsy/orders.js";

describe("order summaries", () => {
  it("returns operational fields and strips customer data", async () => {
    const store = new MemoryCredentialStore();
    await store.set("shop", { userId: 1, shopId: 42 });
    const request = vi.fn().mockResolvedValue({ count: 1, results: [{
      receipt_id: 77,
      status: "paid",
      created_timestamp: 1_700_000_000,
      updated_timestamp: 1_700_000_100,
      grandtotal: { amount: 2500, divisor: 100, currency_code: "USD" },
      transactions: [{ title: "Oak bowl", quantity: 2 }],
      name: "Fake Buyer",
      first_line: "123 Fake Street",
      email: "buyer@example.test",
      payment_method: "fake-card",
      message_from_buyer: "private message"
    }] });
    const service = new OrderService({ request } as never, store);
    const result = await service.listSummaries({ limit: 10 });
    expect(result.results[0]).toEqual({
      orderId: 77,
      status: "paid",
      createdAt: new Date(1_700_000_000_000).toISOString(),
      updatedAt: new Date(1_700_000_100_000).toISOString(),
      items: [{ title: "Oak bowl", quantity: 2 }],
      total: { amount: "25.00", currency: "USD" }
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of ["Fake Buyer", "123 Fake Street", "buyer@example.test", "fake-card", "private message"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
