import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeAmazonAplusContent, buildOptimizedAmazonAplusContentDocument } from "../amazon/aplus-optimization.js";
import { writeAmazonAplusOptimizationWorkbook } from "../amazon/aplus-workbook.js";
import { analyzeAmazonSearchTermReportFile, writeAmazonSearchTermOptimizationWorkbook } from "../amazon/campaign-report-file.js";
import { analyzeAmazonCampaignMetrics, analyzeAmazonSearchTermReportRows } from "../amazon/campaign-optimization.js";
import { analyzeAmazonExistingListing, buildAmazonListingCopyPatch } from "../amazon/listing-optimization.js";
import type { AmazonAdsClient } from "../amazon/ads-client.js";
import type { AmazonSpApiClient } from "../amazon/sp-api-client.js";
import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import type { ConfirmationStore } from "../writes/confirmations.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

type AmazonListingPayload = { summaries?: Array<{ productType?: string }> };
type AmazonListingCopyPreview = {
  sku: string;
  patch: ReturnType<typeof buildAmazonListingCopyPatch>;
};

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

export class AmazonListingWriteService {
  constructor(
    private readonly store: CredentialStore,
    private readonly amazon: Pick<AmazonSpApiClient, "getListingItem" | "patchListingItem">,
    private readonly confirmations: ConfirmationStore
  ) {}

  async previewListingCopyUpdate(sku: string) {
    const preview = await buildListingCopyPreview(this.store, this.amazon, sku);
    return {
      operation: "amazon_update_listing_copy" as const,
      sku,
      productType: preview.patch.productType,
      patch: preview.patch,
      validation: await this.amazon.patchListingItem(sku, preview.patch, { validationPreview: true }),
      applied: false,
      ...this.confirmations.issue("amazon_update_listing_copy", 0, preview),
      warning: "This validation preview did not change the Amazon listing. Confirm with the returned token to apply the exact patch."
    };
  }

  async validateListingCopyUpdate(sku: string) {
    const preview = await buildListingCopyPreview(this.store, this.amazon, sku);
    return {
      operation: "validate_listing_copy_update" as const,
      sku,
      productType: preview.patch.productType,
      patch: preview.patch,
      validation: await this.amazon.patchListingItem(sku, preview.patch, { validationPreview: true }),
      applied: false
    };
  }

  async confirmListingCopyUpdate(sku: string, confirmationToken: string) {
    const preview = await buildListingCopyPreview(this.store, this.amazon, sku);
    this.confirmations.consume(confirmationToken, "amazon_update_listing_copy", 0, preview);
    return {
      operation: "amazon_update_listing_copy" as const,
      sku,
      productType: preview.patch.productType,
      patch: preview.patch,
      result: await this.amazon.patchListingItem(sku, preview.patch),
      applied: true
    };
  }
}

async function buildListingCopyPreview(store: CredentialStore, amazon: Pick<AmazonSpApiClient, "getListingItem">, sku: string): Promise<AmazonListingCopyPreview> {
  const auth = await store.get("amazonSpApiAuth");
  if (!auth) throw new ShopWeaverError("AMAZON_SP_API_AUTH_REQUIRED", "Connect Amazon SP-API before using Amazon seller tools.");
  const listing = await amazon.getListingItem(sku) as { payload?: AmazonListingPayload };
  const listingPayload = (listing.payload ?? listing) as AmazonListingPayload;
  const recommendation = analyzeAmazonExistingListing(listingPayload as never);
  const productType = listingPayload.summaries?.[0]?.productType;
  const marketplaceId = auth.marketplaceIds[0];
  if (!productType || !marketplaceId || !recommendation.optimizedTitle || !recommendation.optimizedBullets || !recommendation.optimizedDescription || !recommendation.optimizedBackendSearchTerms) {
    throw new ShopWeaverError("AMAZON_LISTING_OPTIMIZED_COPY_UNAVAILABLE", "ShopWeaver could not generate optimized copy for this Amazon listing yet.");
  }
  return {
    sku,
    patch: buildAmazonListingCopyPatch({
      marketplaceId,
      productType,
      title: recommendation.optimizedTitle,
      bullets: recommendation.optimizedBullets,
      description: recommendation.optimizedDescription,
      backendSearchTerms: recommendation.optimizedBackendSearchTerms
    })
  };
}

export function registerAmazonTools(server: McpServer, store: CredentialStore, amazon: AmazonSpApiClient, amazonAds?: AmazonAdsClient, amazonListingWrites?: AmazonListingWriteService): void {
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

  server.registerTool("amazon_get_aplus_publish_records", {
    description: "Read published A+ Content records for one ASIN through SP-API. This is read-only and does not change A+ content.",
    inputSchema: { asin: z.string().min(1) }
  }, async ({ asin }) => result(await amazon.getAplusContentPublishRecords(asin)));

  server.registerTool("amazon_get_aplus_content_document", {
    description: "Read one A+ Content document with contents and metadata through SP-API. This is read-only and does not change A+ content.",
    inputSchema: { contentReferenceKey: z.string().min(1) }
  }, async ({ contentReferenceKey }) => result(await amazon.getAplusContentDocument(contentReferenceKey)));

  server.registerTool("amazon_optimize_aplus_content", {
    description: "Read the published English A+ Content document for one ASIN and return review-only optimization recommendations. This does not change A+ content.",
    inputSchema: {
      asin: z.string().min(1),
      expectedFinish: z.string().min(1).optional(),
      expectedHeightInches: z.number().positive().optional()
    }
  }, async ({ asin, expectedFinish, expectedHeightInches }) => {
    const records = await amazon.getAplusContentPublishRecords(asin) as { publishRecordList?: Array<{ locale?: string; contentReferenceKey?: string }> };
    const record = records.publishRecordList?.find(item => item.locale === "en_US") ?? records.publishRecordList?.[0];
    if (!record?.contentReferenceKey) throw new ShopWeaverError("AMAZON_APLUS_CONTENT_NOT_FOUND", "No published A+ content record was found for this ASIN.");
    const document = await amazon.getAplusContentDocument(record.contentReferenceKey) as { contentRecord?: unknown };
    return result({
      contentReferenceKey: record.contentReferenceKey,
      recommendation: analyzeAmazonAplusContent({
        asin,
        expectedFinish,
        expectedHeightInches,
        contentRecord: (document.contentRecord ?? document) as never
      })
    });
  });

  server.registerTool("amazon_validate_optimized_aplus_content", {
    description: "Build an optimized A+ Content document from the currently published A+ document and submit validation only. This does not create, update, publish, or submit A+ content for approval.",
    inputSchema: {
      asin: z.string().min(1),
      expectedFinish: z.string().min(1),
      expectedHeightInches: z.number().positive()
    }
  }, async ({ asin, expectedFinish, expectedHeightInches }) => {
    const records = await amazon.getAplusContentPublishRecords(asin) as { publishRecordList?: Array<{ locale?: string; contentReferenceKey?: string }> };
    const record = records.publishRecordList?.find(item => item.locale === "en_US") ?? records.publishRecordList?.[0];
    if (!record?.contentReferenceKey) throw new ShopWeaverError("AMAZON_APLUS_CONTENT_NOT_FOUND", "No published A+ content record was found for this ASIN.");
    const document = await amazon.getAplusContentDocument(record.contentReferenceKey) as { contentRecord?: { contentDocument?: unknown } };
    const currentDocument = document.contentRecord?.contentDocument ?? (document as { contentDocument?: unknown }).contentDocument;
    if (!currentDocument) throw new ShopWeaverError("AMAZON_APLUS_CONTENT_NOT_FOUND", "No A+ content document payload was found for this ASIN.");
    const optimizedDocument = buildOptimizedAmazonAplusContentDocument(currentDocument as never, {
      asin,
      finish: expectedFinish,
      heightInches: expectedHeightInches
    });
    return result({
      operation: "validate_optimized_aplus_content",
      asin,
      sourceContentReferenceKey: record.contentReferenceKey,
      optimizedDocument,
      validation: await amazon.validateAplusContentDocument([asin], optimizedDocument),
      applied: false
    });
  });

  server.registerTool("amazon_preview_optimized_aplus_content", {
    description: "Build optimized A+ Content from the currently published A+ document and return it for review only. This does not validate, create, update, publish, or submit A+ content.",
    inputSchema: {
      asin: z.string().min(1),
      expectedFinish: z.string().min(1),
      expectedHeightInches: z.number().positive()
    }
  }, async ({ asin, expectedFinish, expectedHeightInches }) => {
    const records = await amazon.getAplusContentPublishRecords(asin) as { publishRecordList?: Array<{ locale?: string; contentReferenceKey?: string }> };
    const record = records.publishRecordList?.find(item => item.locale === "en_US") ?? records.publishRecordList?.[0];
    if (!record?.contentReferenceKey) throw new ShopWeaverError("AMAZON_APLUS_CONTENT_NOT_FOUND", "No published A+ content record was found for this ASIN.");
    const document = await amazon.getAplusContentDocument(record.contentReferenceKey) as { contentRecord?: { contentDocument?: unknown } };
    const currentDocument = document.contentRecord?.contentDocument ?? (document as { contentDocument?: unknown }).contentDocument;
    if (!currentDocument) throw new ShopWeaverError("AMAZON_APLUS_CONTENT_NOT_FOUND", "No A+ content document payload was found for this ASIN.");
    return result({
      operation: "preview_optimized_aplus_content",
      asin,
      sourceContentReferenceKey: record.contentReferenceKey,
      optimizedDocument: buildOptimizedAmazonAplusContentDocument(currentDocument as never, {
        asin,
        finish: expectedFinish,
        heightInches: expectedHeightInches
      }),
      applied: false
    });
  });

  server.registerTool("amazon_write_aplus_optimization_workbook", {
    description: "Read current published A+ Content for ASINs and write a local review workbook with recommendations and optimized draft copy. This does not validate, create, update, publish, or submit A+ content.",
    inputSchema: {
      outputPath: z.string().min(1),
      variations: z.array(z.object({
        asin: z.string().min(1),
        expectedFinish: z.string().min(1),
        expectedHeightInches: z.number().positive()
      })).min(1)
    }
  }, async ({ outputPath, variations }) => {
    const items = [];
    for (const variation of variations) {
      const records = await amazon.getAplusContentPublishRecords(variation.asin) as { publishRecordList?: Array<{ locale?: string; contentReferenceKey?: string }> };
      const record = records.publishRecordList?.find(item => item.locale === "en_US") ?? records.publishRecordList?.[0];
      if (!record?.contentReferenceKey) throw new ShopWeaverError("AMAZON_APLUS_CONTENT_NOT_FOUND", `No published A+ content record was found for ASIN ${variation.asin}.`);
      const document = await amazon.getAplusContentDocument(record.contentReferenceKey) as { contentRecord?: { contentDocument?: unknown } };
      const contentRecord = document.contentRecord ?? document;
      items.push({
        ...variation,
        sourceContentReferenceKey: record.contentReferenceKey,
        contentRecord: contentRecord as never
      });
    }
    return result(await writeAmazonAplusOptimizationWorkbook({ outputPath, items }));
  });

  server.registerTool("amazon_optimize_existing_listing", {
    description: "Read one existing Amazon listing by seller SKU and return review-only optimization recommendations. This does not change the listing.",
    inputSchema: { sku: z.string().min(1) }
  }, async ({ sku }) => result(analyzeAmazonExistingListing(await amazon.getListingItem(sku) as never)));

  server.registerTool("amazon_validate_listing_copy_update", {
    description: "Build optimized copy for one existing Amazon listing and submit an SP-API validation preview. This does not apply listing changes.",
    inputSchema: { sku: z.string().min(1) }
  }, async ({ sku }) => {
    const preview = await buildListingCopyPreview(store, amazon, sku);
    return result({
      operation: "validate_listing_copy_update",
      sku,
      productType: preview.patch.productType,
      patch: preview.patch,
      validation: await amazon.patchListingItem(sku, preview.patch, { validationPreview: true }),
      applied: false
    });
  });

  if (amazonListingWrites) {
    server.registerTool("amazon_update_listing_copy", {
      description: "Preview or confirm applying optimized title, bullets, description, and backend search terms to an existing Amazon listing.",
      inputSchema: {
        mode: z.enum(["preview", "confirm"]).default("preview"),
        sku: z.string().min(1),
        confirmationToken: z.string().min(20).optional()
      }
    }, async ({ mode, sku, confirmationToken }) => result(mode === "preview"
      ? await amazonListingWrites.previewListingCopyUpdate(sku)
      : await amazonListingWrites.confirmListingCopyUpdate(sku, confirmationToken ?? "")));
  }

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

  server.registerTool("amazon_ads_optimize_sp_search_term_report_file", {
    description: "Analyze a local exported Sponsored Products search-term report file. This is read-only and does not change campaigns, bids, budgets, keywords, negatives, or ads.",
    inputSchema: {
      filePath: z.string().min(1)
    }
  }, async ({ filePath }) => result(await analyzeAmazonSearchTermReportFile(filePath)));

  server.registerTool("amazon_ads_write_sp_search_term_optimization_workbook", {
    description: "Analyze a local exported Sponsored Products search-term report file and write an actionable optimization workbook. This does not change campaigns, bids, budgets, keywords, negatives, or ads.",
    inputSchema: {
      reportFilePath: z.string().min(1),
      outputPath: z.string().min(1)
    }
  }, async ({ reportFilePath, outputPath }) => result(await writeAmazonSearchTermOptimizationWorkbook(reportFilePath, outputPath)));

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
