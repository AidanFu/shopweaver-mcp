import { readFile } from "node:fs/promises";

const allowed = [
  "amazon_connection_status",
  "amazon_ads_connection_status",
  "amazon_ads_build_cost_control_plan",
  "amazon_ads_compare_report_files",
  "amazon_ads_create_campaigns",
  "amazon_ads_create_negative_keywords",
  "amazon_ads_create_negative_keywords_from_review",
  "amazon_ads_create_sp_advertised_product_report",
  "amazon_ads_create_sp_search_term_report",
  "amazon_ads_download_report",
  "amazon_ads_get_report",
  "amazon_ads_list_sp_ad_groups",
  "amazon_ads_list_profiles",
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
  "amazon_get_aplus_content_document",
  "amazon_get_aplus_publish_records",
  "amazon_get_listing_item",
  "amazon_get_marketplace_participations",
  "amazon_get_order_items",
  "amazon_list_orders",
  "amazon_optimize_campaign_metrics",
  "amazon_optimize_aplus_content",
  "amazon_optimize_existing_listing",
  "amazon_preview_existing_listing_approved_copy_updates",
  "amazon_preview_optimized_aplus_content",
  "amazon_read_existing_listing_copy_decisions",
  "amazon_update_listing_copy",
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
].sort();

const files = ["src/tools/read-tools.ts", "src/tools/write-tools.ts", "src/tools/google-tools.ts", "src/tools/import-tools.ts", "src/tools/drive-image-tools.ts", "src/tools/amazon-tools.ts"];
const found = [];
for (const file of files) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  for (const match of source.matchAll(/registerTool\("([a-z_]+)"/g)) found.push(match[1]);
}

found.sort();
if (JSON.stringify(found) !== JSON.stringify(allowed)) {
  process.stderr.write(`Unexpected ShopWeaver tool allowlist: ${found.join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("ShopWeaver tool allowlist verified.\n");
}
