import { readFile } from "node:fs/promises";

const allowed = [
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
  "shopweaver_write_enriched_workbook"
].sort();

const files = ["src/tools/read-tools.ts", "src/tools/write-tools.ts", "src/tools/google-tools.ts", "src/tools/import-tools.ts"];
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
