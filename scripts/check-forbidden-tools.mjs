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
  "etsy_upload_draft_image"
].sort();

const files = ["src/tools/read-tools.ts", "src/tools/write-tools.ts"];
const found = [];
for (const file of files) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  for (const match of source.matchAll(/registerTool\("(etsy_[a-z_]+)"/g)) found.push(match[1]);
}

found.sort();
if (JSON.stringify(found) !== JSON.stringify(allowed)) {
  process.stderr.write(`Unexpected ShopWeaver tool allowlist: ${found.join(", ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("ShopWeaver tool allowlist verified.\n");
}
