import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { AmazonListingWriteService } from "../src/tools/amazon-tools.js";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";

const listing = {
  payload: {
    sku: "DH-E37S-W6DM",
    summaries: [{
      productType: "TOWEL_HOLDER",
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
        { value: "Extra bullet one." },
        { value: "Extra bullet two." }
      ],
      product_description: [{ value: "A vertical electric towel warmer rack for bathrooms, designed with stainless steel, a digital timer, and flexible plug-in or hardwired installation options." }],
      generic_keyword: [{ value: "Electric Heated Towel Rack" }]
    },
    issues: []
  }
};

async function dependencies() {
  const store = new MemoryCredentialStore();
  await store.set("amazonSpApiAuth", {
    refreshToken: "refresh",
    sellingPartnerId: "A1SELLER",
    region: "na",
    marketplaceIds: ["ATVPDKIKX0DER"]
  });
  const amazon = {
    getListingItem: vi.fn().mockResolvedValue(listing),
    patchListingItem: vi.fn().mockResolvedValue({ status: "VALID", issues: [] })
  };
  return { amazon, service: new AmazonListingWriteService(store, amazon as never, new ConfirmationStore(() => 1_000)) };
}

describe("AmazonListingWriteService", () => {
  it("previews optimized copy updates through Amazon validation preview without applying changes", async () => {
    const { service, amazon } = await dependencies();

    const preview = await service.previewListingCopyUpdate("DH-E37S-W6DM");

    expect(preview.operation).toBe("amazon_update_listing_copy");
    expect(preview.applied).toBe(false);
    expect(preview.validation).toEqual({ status: "VALID", issues: [] });
    expect(preview.patch.productType).toBe("TOWEL_HOLDER");
    expect(amazon.patchListingItem).toHaveBeenCalledWith("DH-E37S-W6DM", preview.patch, { validationPreview: true });
  });

  it("applies optimized copy only after a matching preview confirmation", async () => {
    const { service, amazon } = await dependencies();
    const preview = await service.previewListingCopyUpdate("DH-E37S-W6DM");

    await expect(service.confirmListingCopyUpdate("77-UM99-B96T", preview.confirmationToken))
      .rejects.toMatchObject({ code: "PREVIEW_MISMATCH" });
    expect(amazon.patchListingItem).toHaveBeenCalledTimes(1);

    const secondPreview = await service.previewListingCopyUpdate("DH-E37S-W6DM");
    await expect(service.confirmListingCopyUpdate("DH-E37S-W6DM", secondPreview.confirmationToken))
      .resolves.toMatchObject({ operation: "amazon_update_listing_copy", applied: true, result: { status: "VALID", issues: [] } });
    expect(amazon.patchListingItem).toHaveBeenLastCalledWith("DH-E37S-W6DM", secondPreview.patch);
  });

  it("previews and confirms approved workbook listing copy updates with exact payload matching", async () => {
    const { service, amazon } = await dependencies();
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-listing-write-"));
    const file = join(dir, "reviewed-listings.xlsx");
    writeReviewedWorkbook(file, "approve");

    const preview = await service.previewApprovedListingCopyUpdates(file, "ATVPDKIKX0DER", "TOWEL_HOLDER");

    expect(preview.operation).toBe("amazon_update_listing_copy_from_workbook");
    expect(preview.applied).toBe(false);
    expect(preview.approvedListingCount).toBe(1);
    expect(preview.validationResults).toEqual([{ sku: "DH-E37S-W6DM", validation: { status: "VALID", issues: [] } }]);
    expect(amazon.patchListingItem).toHaveBeenCalledWith("DH-E37S-W6DM", preview.patches[0].patch, { validationPreview: true });

    writeReviewedWorkbook(file, "defer");
    await expect(service.confirmApprovedListingCopyUpdates(file, "ATVPDKIKX0DER", "TOWEL_HOLDER", preview.confirmationToken))
      .rejects.toMatchObject({ code: "PREVIEW_MISMATCH" });

    writeReviewedWorkbook(file, "approve");
    const secondPreview = await service.previewApprovedListingCopyUpdates(file, "ATVPDKIKX0DER", "TOWEL_HOLDER");
    await expect(service.confirmApprovedListingCopyUpdates(file, "ATVPDKIKX0DER", "TOWEL_HOLDER", secondPreview.confirmationToken))
      .resolves.toMatchObject({
        operation: "amazon_update_listing_copy_from_workbook",
        applied: true,
        approvedListingCount: 1,
        results: [{ sku: "DH-E37S-W6DM", result: { status: "VALID", issues: [] } }]
      });
    expect(amazon.patchListingItem).toHaveBeenLastCalledWith("DH-E37S-W6DM", preview.patches[0].patch);
  });
});

function writeReviewedWorkbook(file: string, decision: string) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    "SKU": "DH-E37S-W6DM",
    "Optimized Title": "Electric Towel Warmer Rack, Wall Mount 3-Bar, 38 in, Gold Finish",
    "Bullet 1": "Benefit one.",
    "Bullet 2": "Benefit two.",
    "Bullet 3": "Benefit three.",
    "Bullet 4": "Worry reducer.",
    "Bullet 5": "Post-sale support.",
    "Optimized Description": "Optimized bathroom comfort description.",
    "Optimized Backend Search Terms": "heated towel rail bathroom towel dryer wall towel warmer",
    "Decision": decision
  }]), "Optimized Copy");
  XLSX.writeFile(workbook, file);
}
