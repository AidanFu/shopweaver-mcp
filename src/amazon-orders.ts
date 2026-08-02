#!/usr/bin/env node
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { readAmazonSearchTermReportRows } from "./amazon/campaign-report-file.js";
import { AmazonSpApiClient } from "./amazon/sp-api-client.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonOrdersArgs {
  createdAfter: string;
  createdBefore?: string;
  marketplaceIds?: string[];
  orderStatuses?: string[];
  maxResultsPerPage?: number;
  nextToken?: string;
  includeItems?: boolean;
  targetSkus?: string[];
  adsReportFilePath?: string;
}

type AmazonOrdersResponse = {
  payload?: {
    CreatedBefore?: string;
    Orders?: Array<{
      AmazonOrderId?: string;
      PurchaseDate?: string;
      OrderStatus?: string;
      NumberOfItemsShipped?: number;
      NumberOfItemsUnshipped?: number;
      OrderTotal?: { CurrencyCode?: string; Amount?: string };
    }>;
  };
};

type AmazonOrderItemsResponse = {
  payload?: {
    OrderItems?: Array<{
      SellerSKU?: string;
      ASIN?: string;
      Title?: string;
      QuantityOrdered?: number;
      ItemPrice?: { CurrencyCode?: string; Amount?: string };
    }>;
  };
};

type AmazonOrdersSummary = {
  skuSales: Array<{
    sku: string;
    asin?: string;
    title?: string;
    quantityOrdered: number;
    totalAmountByCurrency: Record<string, number>;
  }>;
};

export function parseAmazonOrdersArgs(args: string[]): AmazonOrdersArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  const createdAfter = values.get("--created-after");
  if (!createdAfter) throw usageError();
  const maxResults = values.get("--max-results");
  return {
    createdAfter,
    ...(values.get("--created-before") ? { createdBefore: values.get("--created-before") } : {}),
    ...(values.get("--marketplace-ids") ? { marketplaceIds: splitCsv(values.get("--marketplace-ids") ?? "") } : {}),
    ...(values.get("--status") ? { orderStatuses: splitCsv(values.get("--status") ?? "") } : {}),
    ...(maxResults ? { maxResultsPerPage: Number(maxResults) } : {}),
    ...(values.get("--next-token") ? { nextToken: values.get("--next-token") } : {}),
    ...(values.get("--include-items") === "true" ? { includeItems: true } : {}),
    ...(values.get("--target-skus") ? { targetSkus: splitCsv(values.get("--target-skus") ?? "") } : {}),
    ...(values.get("--ads-report-file") ? { adsReportFilePath: values.get("--ads-report-file") } : {})
  };
}

export function summarizeAmazonOrders(response: AmazonOrdersResponse, orderItemsByOrderId: Record<string, AmazonOrderItemsResponse> = {}) {
  const orders = response.payload?.Orders ?? [];
  const statusCounts: Record<string, number> = {};
  const totalAmountByCurrency: Record<string, number> = {};
  const skuSales = new Map<string, {
    sku: string;
    asin?: string;
    title?: string;
    quantityOrdered: number;
    totalAmountByCurrency: Record<string, number>;
  }>();
  const summaries = orders.map(order => {
    const orderStatus = order.OrderStatus ?? "UNKNOWN";
    statusCounts[orderStatus] = (statusCounts[orderStatus] ?? 0) + 1;
    const currencyCode = order.OrderTotal?.CurrencyCode ?? "UNKNOWN";
    const amount = Number(order.OrderTotal?.Amount ?? 0);
    totalAmountByCurrency[currencyCode] = roundCurrency((totalAmountByCurrency[currencyCode] ?? 0) + amount);
    for (const item of orderItemsByOrderId[order.AmazonOrderId ?? ""]?.payload?.OrderItems ?? []) {
      const sku = item.SellerSKU ?? "UNKNOWN";
      const current = skuSales.get(sku) ?? { sku, asin: item.ASIN, title: item.Title, quantityOrdered: 0, totalAmountByCurrency: {} };
      const itemCurrency = item.ItemPrice?.CurrencyCode ?? "UNKNOWN";
      current.quantityOrdered += item.QuantityOrdered ?? 0;
      current.totalAmountByCurrency[itemCurrency] = roundCurrency((current.totalAmountByCurrency[itemCurrency] ?? 0) + Number(item.ItemPrice?.Amount ?? 0));
      skuSales.set(sku, current);
    }
    return {
      purchaseDate: order.PurchaseDate,
      orderStatus,
      itemCount: (order.NumberOfItemsShipped ?? 0) + (order.NumberOfItemsUnshipped ?? 0),
      total: { currencyCode, amount }
    };
  });
  return {
    createdBefore: response.payload?.CreatedBefore,
    orderCount: orders.length,
    totalAmountByCurrency,
    statusCounts,
    skuSales: Array.from(skuSales.values()),
    orders: summaries
  };
}

export function analyzeAmazonOrderSkuSignals(summary: AmazonOrdersSummary, targetSkus: string[]) {
  const soldSkus = new Set(summary.skuSales.map(row => row.sku));
  const targetSkusWithSales = targetSkus.filter(sku => soldSkus.has(sku));
  const targetSkusWithoutSales = targetSkus.filter(sku => !soldSkus.has(sku));
  const targetSet = new Set(targetSkus);
  const nonTargetSkusWithSales = summary.skuSales.map(row => row.sku).filter(sku => !targetSet.has(sku));
  const recommendations = [
    ...(targetSkusWithSales.length ? [`Keep monitoring ${targetSkusWithSales.join(" and ")} because it produced recent sales after optimization.`] : []),
    ...(targetSkusWithoutSales.length ? [`Review traffic, price, offer, images, and campaign targeting for ${targetSkusWithoutSales.join(" and ")} because they had no recent SKU-level sales.`] : []),
    ...(nonTargetSkusWithSales.length ? [`Review ${nonTargetSkusWithSales.join(" and ")} as unexpected demand; decide whether to protect budget, improve listing copy, or separate campaign tracking.`] : [])
  ];
  return { targetSkus, targetSkusWithSales, targetSkusWithoutSales, nonTargetSkusWithSales, recommendations };
}

export function compareAmazonAdsSkuSalesToOrders(summary: AmazonOrdersSummary, adsRows: Array<Record<string, unknown>>, targetSkus: string[]) {
  const sellerSales = new Map(summary.skuSales.map(row => [row.sku, row]));
  const adsSales = new Map<string, { adsOrders: number; adsSales: number; adSpend: number }>();
  for (const row of adsRows) {
    const sku = text(row.advertisedSku ?? row["Advertised SKU"] ?? row.SKU);
    if (!sku) continue;
    const current = adsSales.get(sku) ?? { adsOrders: 0, adsSales: 0, adSpend: 0 };
    current.adsOrders += number(row.purchases7d ?? row.Orders);
    current.adsSales = roundCurrency(current.adsSales + number(row.sales7d ?? row.Sales));
    current.adSpend = roundCurrency(current.adSpend + number(row.cost ?? row.Spend));
    adsSales.set(sku, current);
  }
  const skuComparisons = targetSkus.map(sku => {
    const ads = adsSales.get(sku) ?? { adsOrders: 0, adsSales: 0, adSpend: 0 };
    const seller = sellerSales.get(sku);
    const sellerOrders = seller?.quantityOrdered ?? 0;
    const signal = ads.adsOrders > 0 && sellerOrders > 0
      ? "matched_ads_and_seller_sales"
      : ads.adsOrders > 0
        ? "ads_attributed_without_seller_order"
        : sellerOrders > 0
          ? "seller_order_without_ads_attribution"
          : "no_ads_or_seller_sales";
    return {
      sku,
      ...ads,
      sellerOrders,
      sellerSalesByCurrency: seller?.totalAmountByCurrency ?? {},
      signal,
      recommendation: adsSellerRecommendation(sku, signal)
    };
  });
  return {
    operation: "compare_amazon_ads_sku_sales_to_seller_orders" as const,
    applied: false as const,
    targetSkuCount: targetSkus.length,
    matchedSalesCount: skuComparisons.filter(row => row.signal === "matched_ads_and_seller_sales").length,
    adsOnlySalesCount: skuComparisons.filter(row => row.signal === "ads_attributed_without_seller_order").length,
    sellerOnlySalesCount: skuComparisons.filter(row => row.signal === "seller_order_without_ads_attribution").length,
    noSalesCount: skuComparisons.filter(row => row.signal === "no_ads_or_seller_sales").length,
    skuComparisons
  };
}

export function buildAmazonOrdersAnalysisResult(summary: ReturnType<typeof summarizeAmazonOrders>, input: Pick<AmazonOrdersArgs, "targetSkus">, adsRows: Array<Record<string, unknown>> = []) {
  return {
    ...summary,
    ...(input.targetSkus ? { skuSignals: analyzeAmazonOrderSkuSignals(summary, input.targetSkus) } : {}),
    ...(input.targetSkus && adsRows.length > 0 ? { adsOrderComparison: compareAmazonAdsSkuSalesToOrders(summary, adsRows, input.targetSkus) } : {})
  };
}

async function main(): Promise<void> {
  const store = new KeychainCredentialStore();
  const amazon = new AmazonSpApiClient(store);
  const input = parseAmazonOrdersArgs(process.argv.slice(2));
  const orders = await amazon.listOrders(input) as AmazonOrdersResponse;
  const orderItemsByOrderId: Record<string, AmazonOrderItemsResponse> = {};
  if (input.includeItems) {
    for (const order of orders.payload?.Orders ?? []) {
      if (order.AmazonOrderId) orderItemsByOrderId[order.AmazonOrderId] = await amazon.getOrderItems(order.AmazonOrderId) as AmazonOrderItemsResponse;
    }
  }
  const summary = summarizeAmazonOrders(orders, orderItemsByOrderId);
  const adsRows = input.adsReportFilePath ? await readAmazonSearchTermReportRows(input.adsReportFilePath) : [];
  stdout.write(`${JSON.stringify(buildAmazonOrdersAnalysisResult(summary, input, adsRows), null, 2)}\n`);
}

function splitCsv(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number {
  const parsed = Number(String(value ?? 0).replace(/[$,%]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function adsSellerRecommendation(sku: string, signal: string): string {
  if (signal === "matched_ads_and_seller_sales") return `Keep monitoring ${sku}; Ads attribution and Seller orders both show recent sales.`;
  if (signal === "ads_attributed_without_seller_order") return `Reconcile Ads attribution and Seller orders for ${sku} before scaling spend; Ads shows sales but recent order items do not.`;
  if (signal === "seller_order_without_ads_attribution") return `Protect ${sku} from unnecessary budget cuts; Seller orders exist even though Ads attribution is weak or delayed.`;
  return `Review listing conversion, price, images, A+ content, and campaign targeting for ${sku} before adding budget.`;
}

function usageError() {
  return new ShopWeaverError("AMAZON_ORDERS_ARGS_INVALID", "Usage: npm run amazon:orders -- --created-after ISO_DATE [--created-before ISO_DATE] [--status Unshipped,Shipped] [--max-results 50] [--marketplace-ids ATVPDKIKX0DER] [--next-token TOKEN] [--include-items true] [--target-skus SKU1,SKU2] [--ads-report-file /absolute/path.csv]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon order lookup failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
