import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
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
    const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads, amazonAds, amazonSpApi, amazonListingWrites, amazonAdsWrites });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name).sort()).toEqual([
      "amazon_ads_build_cost_control_plan",
      "amazon_ads_connection_status",
      "amazon_ads_create_campaigns",
      "amazon_ads_create_negative_keywords_from_review",
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
      "amazon_ads_run_campaign_optimization_cycle",
      "amazon_ads_update_ad_group_bids",
      "amazon_ads_update_campaign_budgets",
      "amazon_ads_update_campaign_states",
      "amazon_ads_update_keyword_bids",
      "amazon_ads_write_sp_search_term_optimization_workbook",
      "amazon_connection_status",
      "amazon_get_aplus_content_document",
      "amazon_get_aplus_publish_records",
      "amazon_get_listing_item",
      "amazon_get_marketplace_participations",
      "amazon_optimize_aplus_content",
      "amazon_optimize_campaign_metrics",
      "amazon_optimize_existing_listing",
      "amazon_preview_optimized_aplus_content",
      "amazon_update_listing_copy",
      "amazon_validate_listing_copy_update",
      "amazon_validate_optimized_aplus_content",
      "amazon_write_aplus_optimization_workbook",
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
});
