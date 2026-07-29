import { describe, expect, it, vi } from "vitest";
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
});
