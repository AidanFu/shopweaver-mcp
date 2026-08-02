import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { AmazonAdsClient } from "../src/amazon/ads-client.js";
import { AmazonSpApiClient } from "../src/amazon/sp-api-client.js";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { ListingService } from "../src/etsy/listings.js";
import { OrderService } from "../src/etsy/orders.js";
import { DriveImageUploadService } from "../src/import/drive-image-upload.js";
import { DriveImportService } from "../src/import/drive-import.js";
import { createServer } from "../src/server.js";
import { AmazonAdsWriteService, AmazonListingWriteService } from "../src/tools/amazon-tools.js";
import { GoogleFolderToolService } from "../src/tools/google-tools.js";
import { DraftWriteService } from "../src/tools/write-tools.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";

describe("MCP integration", () => {
  it("exposes exactly the approved tools", async () => {
    const store = new MemoryCredentialStore();
    await store.set("shop", { userId: 1, shopId: 42 });
    const clientApi = { request: vi.fn() } as never;
    const listings = new ListingService(clientApi, store);
    const orders = new OrderService(clientApi, store);
    const writes = new DraftWriteService(clientApi, listings, store, new ConfirmationStore());
    const googleFolders = new GoogleFolderToolService({} as never);
    const driveImports = new DriveImportService({} as never);
    const driveImageUploads = new DriveImageUploadService(clientApi, listings, {} as never, store, new ConfirmationStore());
    const amazonAds = new AmazonAdsClient(store, vi.fn());
    const amazonSpApi = new AmazonSpApiClient(store, vi.fn());
    const amazonListingWrites = new AmazonListingWriteService(store, amazonSpApi, new ConfirmationStore());
    const amazonAdsWrites = new AmazonAdsWriteService(amazonAds, new ConfirmationStore());
    const amazonAdsChangeLog = { record: vi.fn(), read: vi.fn() };
    const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads, amazonAds, amazonSpApi, amazonListingWrites, amazonAdsWrites, amazonAdsChangeLog });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name).sort()).toEqual([
      "amazon_ads_build_cost_control_plan",
      "amazon_ads_compare_report_files",
      "amazon_ads_connection_status",
      "amazon_ads_create_campaigns",
      "amazon_ads_create_negative_keywords",
      "amazon_ads_create_negative_keywords_from_review",
      "amazon_ads_create_sp_advertised_product_report",
      "amazon_ads_create_sp_search_term_report",
      "amazon_ads_download_report",
      "amazon_ads_get_report",
      "amazon_ads_list_profiles",
      "amazon_ads_list_sp_ad_groups",
      "amazon_ads_list_sp_campaigns",
      "amazon_ads_list_sp_keywords",
      "amazon_ads_optimize_sp_search_term_report",
      "amazon_ads_optimize_sp_search_term_report_file",
      "amazon_ads_preview_approved_actions",
      "amazon_ads_read_action_decisions",
      "amazon_ads_read_change_log",
      "amazon_ads_run_campaign_optimization_cycle",
      "amazon_ads_run_sku_ad_group_bid_update_preview",
      "amazon_ads_run_sku_budget_update_preview",
      "amazon_ads_run_sku_keyword_bid_update_preview",
      "amazon_ads_run_sku_negative_keywords_preview",
      "amazon_ads_summarize_change_log",
      "amazon_ads_update_ad_group_bids",
      "amazon_ads_update_campaign_bidding",
      "amazon_ads_update_campaign_budgets",
      "amazon_ads_update_campaign_states",
      "amazon_ads_update_keyword_bids",
      "amazon_ads_write_sp_search_term_optimization_workbook",
      "amazon_connection_status",
      "amazon_get_aplus_content_document",
      "amazon_get_aplus_publish_records",
      "amazon_get_listing_item",
      "amazon_get_marketplace_participations",
      "amazon_get_order_items",
      "amazon_list_orders",
      "amazon_optimize_aplus_content",
      "amazon_optimize_campaign_metrics",
      "amazon_optimize_existing_listing",
      "amazon_preview_existing_listing_approved_copy_updates",
      "amazon_preview_optimized_aplus_content",
      "amazon_read_existing_listing_copy_decisions",
      "amazon_update_listing_copy",
      "amazon_update_listing_copy_from_workbook",
      "amazon_validate_listing_copy_update",
      "amazon_validate_optimized_aplus_content",
      "amazon_write_aplus_optimization_workbook",
      "amazon_write_brand_store_workbook",
      "amazon_write_existing_listing_optimization_workbook",
      "etsy_connection_status",
      "etsy_create_draft_listing",
      "etsy_get_listing",
      "etsy_get_shop",
      "etsy_list_listings",
      "etsy_list_order_summaries",
      "etsy_update_draft_inventory",
      "etsy_update_draft_listing",
      "etsy_upload_draft_image",
      "google_drive_add_allowed_folder",
      "google_drive_connection_status",
      "google_drive_list_allowed_folders",
      "google_drive_remove_allowed_folder",
      "shopweaver_import_drive_folder",
      "shopweaver_preview_etsy_draft_from_enriched_row",
      "shopweaver_refresh_amazon_optimization_recommendations",
      "shopweaver_upload_drive_images_to_etsy_draft",
      "shopweaver_write_amazon_listing_workbook",
      "shopweaver_write_enriched_workbook"
    ]);
    await Promise.all([client.close(), server.close()]);
  });

  it("summarizes the local Amazon Ads change log through a read-only tool", async () => {
    const store = new MemoryCredentialStore();
    await store.set("shop", { userId: 1, shopId: 42 });
    const clientApi = { request: vi.fn() } as never;
    const listings = new ListingService(clientApi, store);
    const orders = new OrderService(clientApi, store);
    const writes = new DraftWriteService(clientApi, listings, store, new ConfirmationStore());
    const googleFolders = new GoogleFolderToolService({} as never);
    const driveImports = new DriveImportService({} as never);
    const driveImageUploads = new DriveImageUploadService(clientApi, listings, {} as never, store, new ConfirmationStore());
    const amazonAds = new AmazonAdsClient(store, vi.fn());
    const amazonSpApi = new AmazonSpApiClient(store, vi.fn());
    const amazonListingWrites = new AmazonListingWriteService(store, amazonSpApi, new ConfirmationStore());
    const amazonAdsWrites = new AmazonAdsWriteService(amazonAds, new ConfirmationStore());
    const amazonAdsChangeLog = {
      record: vi.fn(),
      read: vi.fn().mockResolvedValue({
        operation: "read_amazon_ads_change_log",
        recordCount: 2,
        records: [{
          createdAt: "2026-07-30T20:45:00.000Z",
          operation: "amazon_ads_update_campaign_budgets",
          profileId: "profile-1",
          applied: true,
          payload: { campaigns: [{ campaignId: "campaign-1" }] },
          result: {}
        }, {
          createdAt: "2026-07-30T20:50:00.000Z",
          operation: "amazon_ads_create_negative_keywords",
          profileId: "profile-1",
          applied: true,
          payload: { negativeKeywords: [{ campaignId: "campaign-1", adGroupId: "adgroup-1", keywordText: "free manual" }] },
          result: {}
        }]
      })
    };
    const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads, amazonAds, amazonSpApi, amazonListingWrites, amazonAdsWrites, amazonAdsChangeLog });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const response = await client.callTool({
      name: "amazon_ads_summarize_change_log",
      arguments: { profileId: "profile-1", campaignId: "campaign-1", limit: 25 }
    });

    expect(amazonAdsChangeLog.read).toHaveBeenCalledWith({ profileId: "profile-1", campaignId: "campaign-1", limit: 25 });
    expect(response.structuredContent).toMatchObject({
      operation: "summarize_amazon_ads_change_log",
      filters: {
        profileId: "profile-1",
        campaignId: "campaign-1",
        limit: 25
      },
      sourceRecordCount: 2,
      summary: {
        actionCount: 2,
        operationCounts: {
          amazon_ads_create_negative_keywords: 1,
          amazon_ads_update_campaign_budgets: 1
        },
        campaignIdCount: 1,
        negativeKeywordCount: 1,
        campaignBudgetUpdateCount: 1
      },
      learningPlan: {
        operation: "preview_amazon_ads_applied_action_learning_plan",
        applied: false,
        actionMix: "balanced_cost_and_query_cleanup",
        priority: "high"
      }
    });
    await Promise.all([client.close(), server.close()]);
  });

  it("writes a local Amazon Brand Store review workbook through a read-only tool", async () => {
    const store = new MemoryCredentialStore();
    await store.set("shop", { userId: 1, shopId: 42 });
    const clientApi = { request: vi.fn() } as never;
    const listings = new ListingService(clientApi, store);
    const orders = new OrderService(clientApi, store);
    const writes = new DraftWriteService(clientApi, listings, store, new ConfirmationStore());
    const googleFolders = new GoogleFolderToolService({} as never);
    const driveImports = new DriveImportService({} as never);
    const driveImageUploads = new DriveImageUploadService(clientApi, listings, {} as never, store, new ConfirmationStore());
    const amazonAds = new AmazonAdsClient(store, vi.fn());
    const amazonSpApi = new AmazonSpApiClient(store, vi.fn());
    const amazonListingWrites = new AmazonListingWriteService(store, amazonSpApi, new ConfirmationStore());
    const amazonAdsWrites = new AmazonAdsWriteService(amazonAds, new ConfirmationStore());
    const amazonAdsChangeLog = { record: vi.fn(), read: vi.fn() };
    const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads, amazonAds, amazonSpApi, amazonListingWrites, amazonAdsWrites, amazonAdsChangeLog });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-brand-store-tool-"));
    const outputPath = join(dir, "brand-store.xlsx");

    const response = await client.callTool({
      name: "amazon_write_brand_store_workbook",
      arguments: {
        outputPath,
        brandName: "Senplus Momokids",
        primaryCategory: "Electric towel warmer racks",
        products: [{
          asin: "B0GDPKVXSZ",
          sku: "DH-E37S-W6DM",
          title: "Electric Towel Warmer Rack",
          finish: "Gold",
          price: 49.99,
          priority: "hero"
        }],
        campaignInsights: {
          efficientSearchTerms: ["electric towel warmer gold"],
          wasteSearchTerms: ["free towel warmer manual"]
        }
      }
    });

    expect(response.structuredContent).toMatchObject({
      operation: "write_amazon_brand_store_workbook",
      outputPath,
      productCount: 1
    });
    const workbook = XLSX.read(await readFile(outputPath));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Ads Learning Hooks"])[0]).toMatchObject({
      "Signal": "efficient_search_terms",
      "Recommendation": "Use converting Sponsored Products terms in Store headline and tile copy: electric towel warmer gold."
    });
    await Promise.all([client.close(), server.close()]);
  });

  it("writes a local existing-listing optimization workbook through read-only listing fetches", async () => {
    const store = new MemoryCredentialStore();
    await store.set("shop", { userId: 1, shopId: 42 });
    const clientApi = { request: vi.fn() } as never;
    const listings = new ListingService(clientApi, store);
    const orders = new OrderService(clientApi, store);
    const writes = new DraftWriteService(clientApi, listings, store, new ConfirmationStore());
    const googleFolders = new GoogleFolderToolService({} as never);
    const driveImports = new DriveImportService({} as never);
    const driveImageUploads = new DriveImageUploadService(clientApi, listings, {} as never, store, new ConfirmationStore());
    const amazonAds = new AmazonAdsClient(store, vi.fn());
    const amazonSpApi = {
      getListingItem: vi.fn().mockResolvedValue({
        sku: "DH-E37S-W6DM",
        summaries: [{
          itemName: "Vertical Electric Towel Warmer Rack, Wall Mounted, Stainless Steel, Silver, 38 Inch Height, 3 Bar, Digital Timer with LED Display, Plug-in or Hardwired (Gold)",
          mainImage: { link: "https://example.com/main.jpg" }
        }],
        attributes: {
          bullet_point: [
            { value: "Fast warming towel rail for bathroom comfort." },
            { value: "Wall mounted design saves floor space." },
            { value: "Stainless steel construction supports daily use." },
            { value: "Digital timer helps reduce unnecessary run time." },
            { value: "Plug-in or hardwired installation supports different bathrooms." },
            { value: "Extra bullet one." }
          ],
          product_description: [{ value: "A vertical electric towel warmer rack for bathrooms, designed with stainless steel, a digital timer, and flexible plug-in or hardwired installation options." }],
          generic_keyword: [{ value: "Electric Heated Towel Rack" }]
        },
        issues: []
      })
    } as unknown as AmazonSpApiClient;
    const amazonListingWrites = new AmazonListingWriteService(store, amazonSpApi, new ConfirmationStore());
    const amazonAdsWrites = new AmazonAdsWriteService(amazonAds, new ConfirmationStore());
    const amazonAdsChangeLog = { record: vi.fn(), read: vi.fn() };
    const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads, amazonAds, amazonSpApi, amazonListingWrites, amazonAdsWrites, amazonAdsChangeLog });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-existing-listing-tool-"));
    const outputPath = join(dir, "existing-listing-optimization.xlsx");

    const response = await client.callTool({
      name: "amazon_write_existing_listing_optimization_workbook",
      arguments: {
        outputPath,
        skus: ["DH-E37S-W6DM"],
        marketplaceId: "ATVPDKIKX0DER",
        productType: "TOWEL_HOLDER"
      }
    });

    expect(amazonSpApi.getListingItem).toHaveBeenCalledWith("DH-E37S-W6DM");
    expect(response.structuredContent).toMatchObject({
      operation: "write_amazon_existing_listing_optimization_workbook",
      outputPath,
      listingCount: 1,
      optimizedPatchCount: 1,
      applied: false
    });
    const workbook = XLSX.read(await readFile(outputPath));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Optimized Copy"])[0]).toMatchObject({
      "SKU": "DH-E37S-W6DM",
      "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold"
    });
    await Promise.all([client.close(), server.close()]);
  });

  it("reads and previews approved existing-listing copy workbook decisions", async () => {
    const store = new MemoryCredentialStore();
    await store.set("shop", { userId: 1, shopId: 42 });
    const clientApi = { request: vi.fn() } as never;
    const listings = new ListingService(clientApi, store);
    const orders = new OrderService(clientApi, store);
    const writes = new DraftWriteService(clientApi, listings, store, new ConfirmationStore());
    const googleFolders = new GoogleFolderToolService({} as never);
    const driveImports = new DriveImportService({} as never);
    const driveImageUploads = new DriveImageUploadService(clientApi, listings, {} as never, store, new ConfirmationStore());
    const amazonAds = new AmazonAdsClient(store, vi.fn());
    const amazonSpApi = new AmazonSpApiClient(store, vi.fn());
    const amazonListingWrites = new AmazonListingWriteService(store, amazonSpApi, new ConfirmationStore());
    const amazonAdsWrites = new AmazonAdsWriteService(amazonAds, new ConfirmationStore());
    const amazonAdsChangeLog = { record: vi.fn(), read: vi.fn() };
    const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads, amazonAds, amazonSpApi, amazonListingWrites, amazonAdsWrites, amazonAdsChangeLog });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-existing-listing-review-tool-"));
    const filePath = join(dir, "reviewed-listings.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      "SKU": "DH-E37S-W6DM",
      "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
      "Bullet 1": "Benefit one.",
      "Bullet 2": "Benefit two.",
      "Bullet 3": "Benefit three.",
      "Bullet 4": "Worry reducer.",
      "Bullet 5": "Post-sale support.",
      "Optimized Description": "Optimized bathroom comfort description.",
      "Optimized Backend Search Terms": "heated towel rail bathroom towel dryer wall towel warmer",
      "Decision": "approve"
    }]), "Optimized Copy");
    XLSX.writeFile(workbook, filePath);

    const decisions = await client.callTool({
      name: "amazon_read_existing_listing_copy_decisions",
      arguments: { filePath }
    });
    const preview = await client.callTool({
      name: "amazon_preview_existing_listing_approved_copy_updates",
      arguments: { filePath, marketplaceId: "ATVPDKIKX0DER", productType: "TOWEL_HOLDER" }
    });

    expect(decisions.structuredContent).toMatchObject({
      operation: "read_amazon_existing_listing_copy_decisions",
      reviewedListingCount: 1,
      invalidDecisionCount: 0
    });
    expect(preview.structuredContent).toMatchObject({
      operation: "preview_amazon_existing_listing_approved_copy_updates",
      approvedListingCount: 1,
      applied: false,
      patches: [{
        sku: "DH-E37S-W6DM",
        patch: {
          productType: "TOWEL_HOLDER"
        }
      }]
    });
    await Promise.all([client.close(), server.close()]);
  });

  it("previews workbook listing copy updates through Amazon validation without applying changes", async () => {
    const store = new MemoryCredentialStore();
    await store.set("amazonSpApiAuth", {
      refreshToken: "refresh",
      sellingPartnerId: "A1SELLER",
      region: "na",
      marketplaceIds: ["ATVPDKIKX0DER"]
    });
    const clientApi = { request: vi.fn() } as never;
    const listings = new ListingService(clientApi, store);
    const orders = new OrderService(clientApi, store);
    const writes = new DraftWriteService(clientApi, listings, store, new ConfirmationStore());
    const googleFolders = new GoogleFolderToolService({} as never);
    const driveImports = new DriveImportService({} as never);
    const driveImageUploads = new DriveImageUploadService(clientApi, listings, {} as never, store, new ConfirmationStore());
    const amazonAds = new AmazonAdsClient(store, vi.fn());
    const amazonSpApi = {
      getListingItem: vi.fn(),
      patchListingItem: vi.fn().mockResolvedValue({ status: "VALID", issues: [] })
    } as unknown as AmazonSpApiClient;
    const amazonListingWrites = new AmazonListingWriteService(store, amazonSpApi, new ConfirmationStore(() => 1_000));
    const amazonAdsWrites = new AmazonAdsWriteService(amazonAds, new ConfirmationStore());
    const amazonAdsChangeLog = { record: vi.fn(), read: vi.fn() };
    const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads, amazonAds, amazonSpApi, amazonListingWrites, amazonAdsWrites, amazonAdsChangeLog });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-listing-write-tool-"));
    const filePath = join(dir, "reviewed-listings.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      "SKU": "DH-E37S-W6DM",
      "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, Gold",
      "Bullet 1": "Benefit one.",
      "Bullet 2": "Benefit two.",
      "Bullet 3": "Benefit three.",
      "Bullet 4": "Worry reducer.",
      "Bullet 5": "Post-sale support.",
      "Optimized Description": "Optimized bathroom comfort description.",
      "Optimized Backend Search Terms": "heated towel rail bathroom towel dryer wall towel warmer",
      "Decision": "approve"
    }]), "Optimized Copy");
    XLSX.writeFile(workbook, filePath);

    const response = await client.callTool({
      name: "amazon_update_listing_copy_from_workbook",
      arguments: {
        mode: "preview",
        filePath,
        marketplaceId: "ATVPDKIKX0DER",
        productType: "TOWEL_HOLDER"
      }
    });

    expect(response.structuredContent).toMatchObject({
      operation: "amazon_update_listing_copy_from_workbook",
      applied: false,
      approvedListingCount: 1,
      validationResults: [{ sku: "DH-E37S-W6DM", validation: { status: "VALID", issues: [] } }]
    });
    expect(amazonSpApi.patchListingItem).toHaveBeenCalledWith("DH-E37S-W6DM", expect.objectContaining({ productType: "TOWEL_HOLDER" }), { validationPreview: true });
    await Promise.all([client.close(), server.close()]);
  });
});
