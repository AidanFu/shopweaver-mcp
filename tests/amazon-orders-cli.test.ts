import { describe, expect, it } from "vitest";
import { parseAmazonOrdersArgs, summarizeAmazonOrders } from "../src/amazon-orders.js";

describe("parseAmazonOrdersArgs", () => {
  it("parses a read-only Amazon order lookup window", () => {
    expect(parseAmazonOrdersArgs([
      "--created-after", "2026-07-29T00:00:00Z",
      "--created-before", "2026-08-01T00:00:00Z",
      "--status", "Unshipped,Shipped",
      "--max-results", "50"
    ])).toEqual({
      createdAfter: "2026-07-29T00:00:00Z",
      createdBefore: "2026-08-01T00:00:00Z",
      orderStatuses: ["Unshipped", "Shipped"],
      maxResultsPerPage: 50
    });
  });

  it("summarizes orders without exposing order IDs or addresses", () => {
    expect(summarizeAmazonOrders({
      payload: {
        CreatedBefore: "2026-08-01T12:34:37Z",
        Orders: [
          {
            AmazonOrderId: "113-5004643-9613005",
            PurchaseDate: "2026-07-29T00:07:00Z",
            OrderStatus: "Shipped",
            NumberOfItemsShipped: 1,
            NumberOfItemsUnshipped: 0,
            OrderTotal: { CurrencyCode: "USD", Amount: "210.42" },
            ShippingAddress: { City: "SILSBEE", StateOrRegion: "TX" }
          },
          {
            AmazonOrderId: "114-2202867-9630638",
            PurchaseDate: "2026-07-31T21:00:53Z",
            OrderStatus: "Unshipped",
            NumberOfItemsShipped: 0,
            NumberOfItemsUnshipped: 1,
            OrderTotal: { CurrencyCode: "USD", Amount: "21.43" },
            ShippingAddress: { City: "Encinitas", StateOrRegion: "CA" }
          }
        ]
      }
    })).toEqual({
      createdBefore: "2026-08-01T12:34:37Z",
      orderCount: 2,
      totalAmountByCurrency: { USD: 231.85 },
      statusCounts: { Shipped: 1, Unshipped: 1 },
      orders: [
        {
          purchaseDate: "2026-07-29T00:07:00Z",
          orderStatus: "Shipped",
          itemCount: 1,
          total: { currencyCode: "USD", amount: 210.42 }
        },
        {
          purchaseDate: "2026-07-31T21:00:53Z",
          orderStatus: "Unshipped",
          itemCount: 1,
          total: { currencyCode: "USD", amount: 21.43 }
        }
      ]
    });
  });
});
