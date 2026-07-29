import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeAmazonCampaignMetrics, analyzeAmazonSearchTermReportRows } from "../amazon/campaign-optimization.js";
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

    server.registerTool("amazon_ads_create_sp_search_term_report", {
      description: "Request an asynchronous Sponsored Products search-term report for one Amazon Ads profile. This is read-only and does not change campaigns, bids, budgets, keywords, negatives, or ads.",
      inputSchema: {
        profileId: z.string().min(1),
        name: z.string().min(1),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timeUnit: z.enum(["SUMMARY", "DAILY"]).default("SUMMARY"),
        keywordType: z.array(z.enum(["BROAD", "PHRASE", "EXACT", "TARGETING_EXPRESSION", "TARGETING_EXPRESSION_PREDEFINED"])).default(["BROAD", "PHRASE", "EXACT"])
      }
    }, async ({ profileId, name, startDate, endDate, timeUnit, keywordType }) => result(await amazonAds.createSponsoredProductsSearchTermReport(profileId, {
      name,
      startDate,
      endDate,
      timeUnit,
      keywordType
    })));

    server.registerTool("amazon_ads_get_report", {
      description: "Read Amazon Ads report generation status by report ID. Completed responses may include a download URL. This does not change ads.",
      inputSchema: {
        profileId: z.string().min(1),
        reportId: z.string().min(1)
      }
    }, async ({ profileId, reportId }) => result(await amazonAds.getReport(profileId, reportId)));

    server.registerTool("amazon_ads_download_report", {
      description: "Download and parse a completed Amazon Ads GZIP_JSON report URL. This is read-only and does not change ads.",
      inputSchema: {
        url: z.string().url()
      }
    }, async ({ url }) => {
      const rows = await amazonAds.downloadReportRows(url);
      return result({ rowCount: rows.length, rows });
    });

    server.registerTool("amazon_ads_optimize_sp_search_term_report", {
      description: "Download a completed Sponsored Products search-term report URL and return review-only campaign optimization recommendations. This does not change campaigns, bids, budgets, keywords, negatives, or ads.",
      inputSchema: {
        url: z.string().url()
      }
    }, async ({ url }) => result(analyzeAmazonSearchTermReportRows(await amazonAds.downloadReportRows(url))));

    server.registerTool("amazon_ads_list_sp_campaigns", {
      description: "Read Sponsored Products campaigns for one Amazon Ads profile. This is read-only and does not change campaigns, bids, budgets, keywords, negatives, or ads.",
      inputSchema: {
        profileId: z.string().min(1),
        stateFilter: z.array(z.enum(["ENABLED", "PAUSED", "ARCHIVED"])).optional(),
        maxResults: z.number().int().min(1).max(100).optional(),
        nextToken: z.string().min(1).optional()
      }
    }, async ({ profileId, stateFilter, maxResults, nextToken }) => result(await amazonAds.listSponsoredProductsCampaigns(profileId, {
      ...(stateFilter ? { stateFilter: { include: stateFilter } } : {}),
      ...(maxResults ? { maxResults } : {}),
      ...(nextToken ? { nextToken } : {})
    })));

    server.registerTool("amazon_ads_list_sp_ad_groups", {
      description: "Read Sponsored Products ad groups for one Amazon Ads profile. This is read-only and does not change campaigns, ad groups, bids, budgets, keywords, negatives, or ads.",
      inputSchema: {
        profileId: z.string().min(1),
        campaignIds: z.array(z.string().min(1)).optional(),
        adGroupIds: z.array(z.string().min(1)).optional(),
        stateFilter: z.array(z.enum(["ENABLED", "PAUSED", "ARCHIVED"])).optional(),
        campaignTargetingTypeFilter: z.enum(["AUTO", "MANUAL"]).optional(),
        includeExtendedDataFields: z.boolean().optional(),
        maxResults: z.number().int().min(1).max(100).optional(),
        nextToken: z.string().min(1).optional()
      }
    }, async ({ profileId, campaignIds, adGroupIds, stateFilter, campaignTargetingTypeFilter, includeExtendedDataFields, maxResults, nextToken }) => result(await amazonAds.listSponsoredProductsAdGroups(profileId, {
      ...(campaignIds ? { campaignIdFilter: { include: campaignIds } } : {}),
      ...(adGroupIds ? { adGroupIdFilter: { include: adGroupIds } } : {}),
      ...(stateFilter ? { stateFilter: { include: stateFilter } } : {}),
      ...(campaignTargetingTypeFilter ? { campaignTargetingTypeFilter } : {}),
      ...(includeExtendedDataFields === undefined ? {} : { includeExtendedDataFields }),
      ...(maxResults ? { maxResults } : {}),
      ...(nextToken ? { nextToken } : {})
    })));

    server.registerTool("amazon_ads_list_sp_keywords", {
      description: "Read Sponsored Products keywords for one Amazon Ads profile. This is read-only and does not change campaigns, ad groups, bids, keywords, negatives, or ads.",
      inputSchema: {
        profileId: z.string().min(1),
        campaignIds: z.array(z.string().min(1)).optional(),
        adGroupIds: z.array(z.string().min(1)).optional(),
        keywordIds: z.array(z.string().min(1)).optional(),
        keywordTexts: z.array(z.string().min(1)).optional(),
        keywordTextMatchType: z.enum(["BROAD_MATCH", "EXACT_MATCH"]).optional(),
        matchTypes: z.array(z.enum(["BROAD", "PHRASE", "EXACT"])).optional(),
        stateFilter: z.array(z.enum(["ARCHIVED", "ENABLED", "ENABLING", "OTHER", "PAUSED", "PROPOSED", "USER_DELETED"])).optional(),
        locale: z.string().min(1).optional(),
        includeExtendedDataFields: z.boolean().optional(),
        maxResults: z.number().int().min(1).max(100).optional(),
        nextToken: z.string().min(1).optional()
      }
    }, async ({ profileId, campaignIds, adGroupIds, keywordIds, keywordTexts, keywordTextMatchType, matchTypes, stateFilter, locale, includeExtendedDataFields, maxResults, nextToken }) => result(await amazonAds.listSponsoredProductsKeywords(profileId, {
      ...(campaignIds ? { campaignIdFilter: { include: campaignIds } } : {}),
      ...(adGroupIds ? { adGroupIdFilter: { include: adGroupIds } } : {}),
      ...(keywordIds ? { keywordIdFilter: { include: keywordIds } } : {}),
      ...(keywordTexts || keywordTextMatchType ? { keywordTextFilter: { ...(keywordTexts ? { include: keywordTexts } : {}), ...(keywordTextMatchType ? { queryTermMatchType: keywordTextMatchType } : {}) } } : {}),
      ...(matchTypes ? { matchTypeFilter: matchTypes } : {}),
      ...(stateFilter ? { stateFilter: { include: stateFilter } } : {}),
      ...(locale ? { locale } : {}),
      ...(includeExtendedDataFields === undefined ? {} : { includeExtendedDataFields }),
      ...(maxResults ? { maxResults } : {}),
      ...(nextToken ? { nextToken } : {})
    })));
  }
}
