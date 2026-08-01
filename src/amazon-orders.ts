#!/usr/bin/env node
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
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
    ...(values.get("--include-items") === "true" ? { includeItems: true } : {})
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
  stdout.write(`${JSON.stringify(summarizeAmazonOrders(orders, orderItemsByOrderId), null, 2)}\n`);
}

function splitCsv(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function usageError() {
  return new ShopWeaverError("AMAZON_ORDERS_ARGS_INVALID", "Usage: npm run amazon:orders -- --created-after ISO_DATE [--created-before ISO_DATE] [--status Unshipped,Shipped] [--max-results 50] [--marketplace-ids ATVPDKIKX0DER] [--next-token TOKEN]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon order lookup failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
