import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import type { EtsyClient } from "./client.js";
import { PageSchema, ReceiptSchema, publicMoney } from "./schemas.js";

export type OrderSummaryInput = { limit?: number; offset?: number; minCreated?: number; maxCreated?: number };

export class OrderService {
  constructor(private readonly client: EtsyClient, private readonly store: CredentialStore) {}

  async listSummaries(input: OrderSummaryInput) {
    const shop = await this.store.get("shop");
    if (!shop) throw new ShopWeaverError("SHOP_NOT_CONNECTED", "Connect one Etsy shop before reading orders.");
    const query = new URLSearchParams({
      limit: String(Math.min(Math.max(input.limit ?? 25, 1), 100)),
      offset: String(Math.max(input.offset ?? 0, 0))
    });
    if (input.minCreated !== undefined) query.set("min_created", String(input.minCreated));
    if (input.maxCreated !== undefined) query.set("max_created", String(input.maxCreated));
    const page = await this.client.request(`/application/shops/${shop.shopId}/receipts?${query}`, {}, PageSchema(ReceiptSchema));
    return {
      count: page.count,
      results: page.results.map(receipt => ({
        orderId: receipt.receipt_id,
        status: receipt.status,
        createdAt: new Date(receipt.created_timestamp * 1000).toISOString(),
        updatedAt: new Date(receipt.updated_timestamp * 1000).toISOString(),
        items: receipt.transactions.map(transaction => ({ title: transaction.title, quantity: transaction.quantity })),
        total: publicMoney(receipt.grandtotal)
      }))
    };
  }
}
