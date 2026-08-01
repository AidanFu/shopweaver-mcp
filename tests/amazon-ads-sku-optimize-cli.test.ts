import { describe, expect, it } from "vitest";
import { parseAmazonAdsSkuOptimizeArgs } from "../src/amazon-ads-sku-optimize.js";

describe("parseAmazonAdsSkuOptimizeArgs", () => {
  it("parses SKU campaign optimization cycle arguments", () => {
    expect(parseAmazonAdsSkuOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-29",
      "--end-date", "2026-08-01",
      "--target-skus", "DH-E37S-W6DM,77-UM99-B96T,5H-2EH1-7H77",
      "--target-skus-with-sales", "5H-2EH1-7H77",
      "--non-target-skus-with-sales", "80-16Z5-E38T",
      "--report-id", "sku-report-1"
    ])).toEqual({
      profileId: "749555662454438",
      startDate: "2026-07-29",
      endDate: "2026-08-01",
      targetSkus: ["DH-E37S-W6DM", "77-UM99-B96T", "5H-2EH1-7H77"],
      targetSkusWithSales: ["5H-2EH1-7H77"],
      nonTargetSkusWithSales: ["80-16Z5-E38T"],
      reportId: "sku-report-1"
    });
  });
});
