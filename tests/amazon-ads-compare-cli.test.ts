import { describe, expect, it } from "vitest";
import { parseAmazonAdsCompareArgs } from "../src/amazon-ads-compare.js";

describe("parseAmazonAdsCompareArgs", () => {
  it("parses report comparison arguments with optional profile history", () => {
    expect(parseAmazonAdsCompareArgs([
      "--before-label", "before",
      "--before-start-date", "2026-07-16",
      "--before-end-date", "2026-07-29",
      "--before-file", "/tmp/before.csv",
      "--after-label", "after",
      "--after-start-date", "2026-07-30",
      "--after-end-date", "2026-08-05",
      "--after-file", "/tmp/after.csv",
      "--profile-id", "749555662454438"
    ])).toEqual({
      beforeLabel: "before",
      beforeStartDate: "2026-07-16",
      beforeEndDate: "2026-07-29",
      beforeFilePath: "/tmp/before.csv",
      afterLabel: "after",
      afterStartDate: "2026-07-30",
      afterEndDate: "2026-08-05",
      afterFilePath: "/tmp/after.csv",
      profileId: "749555662454438"
    });
  });
});
