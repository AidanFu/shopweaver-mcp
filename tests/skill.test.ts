import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ShopWeaver skill", () => {
  it("contains the required trigger and safety workflow", async () => {
    const skill = await readFile(new URL("../skills/shopweaver/SKILL.md", import.meta.url), "utf8");
    expect(skill).toMatch(/^---\nname: shopweaver\ndescription: Use when /);
    for (const required of [
      "etsy_connection_status",
      "Never ask the user to paste credentials",
      "Preview",
      "explicit confirmation",
      "unchanged payload",
      "not a draft",
      "publish, delete, advertise, refund, cancel, ship, message, or email"
    ]) expect(skill).toContain(required);
  });

  it("documents the Etsy variation draft workflow", async () => {
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
    const skill = await readFile(new URL("../skills/shopweaver/SKILL.md", import.meta.url), "utf8");
    for (const document of [readme, skill]) {
      for (const required of [
        "### Etsy variation drafts",
        "shopweaver_preview_etsy_variation_groups",
        "shopweaver_write_etsy_variation_workbook",
        "Product Information - Etsy Draft.xlsx",
        "shopweaver_preview_etsy_variation_draft",
        "etsy_create_draft_listing",
        "shopweaver_upload_drive_variation_images_to_etsy_draft",
        "etsy_update_draft_inventory",
        "ShopWeaver does not publish, delete, update active listings, manage ads, process refunds, create shipments, send messages, or email buyers."
      ]) expect(document).toContain(required);
    }
  });
});
