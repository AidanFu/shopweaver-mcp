import { describe, expect, it } from "vitest";
import { analyzeAmazonOrderSkuSignals, buildAmazonOrdersAnalysisResult, compareAmazonAdsSkuSalesToOrders, parseAmazonOrdersArgs, summarizeAmazonOrders } from "../src/amazon-orders.js";

describe("parseAmazonOrdersArgs", () => {
  it("parses a read-only Amazon order lookup window", () => {
    expect(parseAmazonOrdersArgs([
      "--created-after", "2026-07-29T00:00:00Z",
      "--created-before", "2026-08-01T00:00:00Z",
      "--status", "Unshipped,Shipped",
      "--max-results", "50",
      "--include-items", "true",
      "--target-skus", "DH-E37S-W6DM,77-UM99-B96T",
      "--ads-report-file", "/tmp/advertised-products.csv"
    ])).toEqual({
      createdAfter: "2026-07-29T00:00:00Z",
      createdBefore: "2026-08-01T00:00:00Z",
      orderStatuses: ["Unshipped", "Shipped"],
      maxResultsPerPage: 50,
      includeItems: true,
      targetSkus: ["DH-E37S-W6DM", "77-UM99-B96T"],
      adsReportFilePath: "/tmp/advertised-products.csv"
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
      skuSales: [],
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

  it("summarizes SKU-level sales when order items are available", () => {
    expect(summarizeAmazonOrders({
      payload: {
        Orders: [
          {
            AmazonOrderId: "113-5004643-9613005",
            PurchaseDate: "2026-07-29T00:07:00Z",
            OrderStatus: "Shipped",
            NumberOfItemsShipped: 1,
            OrderTotal: { CurrencyCode: "USD", Amount: "210.42" }
          }
        ]
      }
    }, {
      "113-5004643-9613005": {
        payload: {
          OrderItems: [
            {
              SellerSKU: "DH-E37S-W6DM",
              ASIN: "B0GDPKVXSZ",
              Title: "Electric Towel Warmer Rack",
              QuantityOrdered: 1,
              ItemPrice: { CurrencyCode: "USD", Amount: "189.90" }
            }
          ]
        }
      }
    })).toMatchObject({
      skuSales: [
        {
          sku: "DH-E37S-W6DM",
          asin: "B0GDPKVXSZ",
          title: "Electric Towel Warmer Rack",
          quantityOrdered: 1,
          totalAmountByCurrency: { USD: 189.9 }
        }
      ]
    });
  });

  it("flags optimized SKUs that sold, optimized SKUs without sales, and non-target demand", () => {
    expect(analyzeAmazonOrderSkuSignals({
      skuSales: [
        { sku: "5H-2EH1-7H77", asin: "B0GD7T3YGK", title: "Silver towel warmer", quantityOrdered: 1, totalAmountByCurrency: { USD: 184.9 } },
        { sku: "80-16Z5-E38T", asin: "B0GTJ594TN", title: "Hardware kit", quantityOrdered: 1, totalAmountByCurrency: { USD: 15 } }
      ]
    }, ["DH-E37S-W6DM", "77-UM99-B96T", "5H-2EH1-7H77"])).toEqual({
      targetSkus: ["DH-E37S-W6DM", "77-UM99-B96T", "5H-2EH1-7H77"],
      targetSkusWithSales: ["5H-2EH1-7H77"],
      targetSkusWithoutSales: ["DH-E37S-W6DM", "77-UM99-B96T"],
      nonTargetSkusWithSales: ["80-16Z5-E38T"],
      recommendations: [
        "Keep monitoring 5H-2EH1-7H77 because it produced recent sales after optimization.",
        "Review traffic, price, offer, images, and campaign targeting for DH-E37S-W6DM and 77-UM99-B96T because they had no recent SKU-level sales.",
        "Review 80-16Z5-E38T as unexpected demand; decide whether to protect budget, improve listing copy, or separate campaign tracking."
      ]
    });
  });

  it("compares Ads-attributed SKU sales with Seller order item sales", () => {
    expect(compareAmazonAdsSkuSalesToOrders({
      skuSales: [
        { sku: "5H-2EH1-7H77", quantityOrdered: 1, totalAmountByCurrency: { USD: 184.9 } },
        { sku: "80-16Z5-E38T", quantityOrdered: 1, totalAmountByCurrency: { USD: 15 } }
      ]
    }, [
      { advertisedSku: "DH-E37S-W6DM", purchases7d: 1, sales7d: 189.9, cost: 32 },
      { advertisedSku: "77-UM99-B96T", purchases7d: 0, sales7d: 0, cost: 26 },
      { advertisedSku: "5H-2EH1-7H77", purchases7d: 0, sales7d: 0, cost: 18 }
    ], ["DH-E37S-W6DM", "77-UM99-B96T", "5H-2EH1-7H77"])).toEqual({
      operation: "compare_amazon_ads_sku_sales_to_seller_orders",
      applied: false,
      targetSkuCount: 3,
      matchedSalesCount: 0,
      adsOnlySalesCount: 1,
      sellerOnlySalesCount: 1,
      noSalesCount: 1,
      skuComparisons: [{
        sku: "DH-E37S-W6DM",
        adsOrders: 1,
        adsSales: 189.9,
        adSpend: 32,
        sellerOrders: 0,
        sellerSalesByCurrency: {},
        signal: "ads_attributed_without_seller_order",
        recommendation: "Reconcile Ads attribution and Seller orders for DH-E37S-W6DM before scaling spend; Ads shows sales but recent order items do not."
      }, {
        sku: "77-UM99-B96T",
        adsOrders: 0,
        adsSales: 0,
        adSpend: 26,
        sellerOrders: 0,
        sellerSalesByCurrency: {},
        signal: "no_ads_or_seller_sales",
        recommendation: "Review listing conversion, price, images, A+ content, and campaign targeting for 77-UM99-B96T before adding budget."
      }, {
        sku: "5H-2EH1-7H77",
        adsOrders: 0,
        adsSales: 0,
        adSpend: 18,
        sellerOrders: 1,
        sellerSalesByCurrency: { USD: 184.9 },
        signal: "seller_order_without_ads_attribution",
        recommendation: "Protect 5H-2EH1-7H77 from unnecessary budget cuts; Seller orders exist even though Ads attribution is weak or delayed."
      }]
    });
  });

  it("builds an order analysis result with Ads comparison when report rows are provided", () => {
    expect(buildAmazonOrdersAnalysisResult({
      createdBefore: "2026-08-01T12:34:37Z",
      orderCount: 1,
      totalAmountByCurrency: { USD: 184.9 },
      statusCounts: { Shipped: 1 },
      skuSales: [
        { sku: "5H-2EH1-7H77", quantityOrdered: 1, totalAmountByCurrency: { USD: 184.9 } }
      ],
      orders: []
    }, {
      targetSkus: ["DH-E37S-W6DM", "5H-2EH1-7H77"]
    }, [
      { advertisedSku: "DH-E37S-W6DM", purchases7d: 0, sales7d: 0, cost: 32 },
      { advertisedSku: "5H-2EH1-7H77", purchases7d: 1, sales7d: 184.9, cost: 18 }
    ])).toMatchObject({
      orderCount: 1,
      skuSignals: {
        targetSkusWithSales: ["5H-2EH1-7H77"],
        targetSkusWithoutSales: ["DH-E37S-W6DM"]
      },
      adsOrderComparison: {
        operation: "compare_amazon_ads_sku_sales_to_seller_orders",
        matchedSalesCount: 1,
        noSalesCount: 1
      }
    });
  });
});
