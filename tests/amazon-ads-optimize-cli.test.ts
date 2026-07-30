import { describe, expect, it } from "vitest";
import { parseAmazonAdsOptimizeArgs } from "../src/amazon-ads-optimize.js";

describe("parseAmazonAdsOptimizeArgs", () => {
  it("parses required campaign optimization cycle arguments", () => {
    expect(parseAmazonAdsOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-16",
      "--end-date", "2026-07-29",
      "--output", "/tmp/amazon-ads.xlsx"
    ])).toEqual({
      profileId: "749555662454438",
      startDate: "2026-07-16",
      endDate: "2026-07-29",
      outputPath: "/tmp/amazon-ads.xlsx"
    });
  });

  it("parses an optional report ID for polling an existing report", () => {
    expect(parseAmazonAdsOptimizeArgs([
      "--profile-id", "749555662454438",
      "--start-date", "2026-07-16",
      "--end-date", "2026-07-29",
      "--output", "/tmp/amazon-ads.xlsx",
      "--report-id", "report-1"
    ])).toMatchObject({ reportId: "report-1" });
  });
});
