import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeAmazonCampaignMetrics } from "../amazon/campaign-optimization.js";
import { analyzeAmazonExistingListing } from "../amazon/listing-optimization.js";
import type { AmazonAdsClient } from "../amazon/ads-client.js";
import type { AmazonSpApiClient } from "../amazon/sp-api-client.js";
import type { CredentialStore } from "../credentials/types.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export async function amazonConnectionStatus(store: CredentialStore) {
  const [app, auth] = await Promise.all([store.get("amazonSpApiApp"), store.get("amazonSpApiAuth")]);
  return {
    credentialsAvailable: app !== null,
    authorized: auth !== null,
    sellingPartnerConnected: auth?.sellingPartnerId !== undefined,
    region: auth?.region ?? null,
    marketplaceIds: auth?.marketplaceIds ?? []
  };
}

export async function amazonAdsConnectionStatus(store: CredentialStore) {
  const [app, auth] = await Promise.all([store.get("amazonAdsApp"), store.get("amazonAdsAuth")]);
  return {
    credentialsAvailable: app !== null,
    authorized: auth !== null,
    region: auth?.region ?? null
  };
}

export function registerAmazonTools(server: McpServer, store: CredentialStore, amazon: AmazonSpApiClient, amazonAds?: AmazonAdsClient): void {
  server.registerTool("amazon_connection_status", {
    description: "Report whether ShopWeaver has Amazon SP-API credentials and seller authorization without revealing secrets.",
    inputSchema: {}
  }, async () => result(await amazonConnectionStatus(store)));

  server.registerTool("amazon_ads_connection_status", {
    description: "Report whether ShopWeaver has Amazon Ads API credentials and advertiser authorization without revealing secrets.",
    inputSchema: {}
  }, async () => result(await amazonAdsConnectionStatus(store)));

  server.registerTool("amazon_get_marketplace_participations", {
    description: "Read the connected Amazon seller marketplace participations through SP-API. This is read-only and does not change listings, ads, bids, budgets, or orders.",
    inputSchema: {}
  }, async () => result(await amazon.getMarketplaceParticipations()));

  server.registerTool("amazon_get_listing_item", {
    description: "Read one existing Amazon listing item by seller SKU through SP-API for optimization review. This is read-only and does not change listings.",
    inputSchema: { sku: z.string().min(1) }
  }, async ({ sku }) => result(await amazon.getListingItem(sku)));

  server.registerTool("amazon_optimize_existing_listing", {
    description: "Read one existing Amazon listing by seller SKU and return review-only optimization recommendations. This does not change the listing.",
    inputSchema: { sku: z.string().min(1) }
  }, async ({ sku }) => result(analyzeAmazonExistingListing(await amazon.getListingItem(sku) as never)));

  server.registerTool("amazon_optimize_campaign_metrics", {
    description: "Return review-only Amazon campaign optimization recommendations from provided campaign metrics. This does not change campaigns, bids, budgets, keywords, negatives, or ads.",
    inputSchema: {
      campaignId: z.string().min(1),
      campaignName: z.string().min(1),
      spend: z.number().nonnegative(),
      sales: z.number().nonnegative(),
      clicks: z.number().int().nonnegative(),
      orders: z.number().int().nonnegative(),
      acos: z.number().nonnegative(),
      searchTerms: z.string()
    }
  }, async (metrics) => result(analyzeAmazonCampaignMetrics(metrics)));

  if (amazonAds) {
    server.registerTool("amazon_ads_list_profiles", {
      description: "Read Amazon Ads advertiser profiles through the Ads API. This is read-only and does not change campaigns, bids, budgets, keywords, negatives, or ads.",
      inputSchema: {}
    }, async () => result(await amazonAds.listProfiles()));
  }
}
