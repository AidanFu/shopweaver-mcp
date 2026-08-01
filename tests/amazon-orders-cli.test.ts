import { describe, expect, it } from "vitest";
import { parseAmazonOrdersArgs } from "../src/amazon-orders.js";

describe("parseAmazonOrdersArgs", () => {
  it("parses a read-only Amazon order lookup window", () => {
    expect(parseAmazonOrdersArgs([
      "--created-after", "2026-07-29T00:00:00Z",
      "--created-before", "2026-08-01T00:00:00Z",
      "--status", "Unshipped,Shipped",
      "--max-results", "50"
    ])).toEqual({
      createdAfter: "2026-07-29T00:00:00Z",
      createdBefore: "2026-08-01T00:00:00Z",
      orderStatuses: ["Unshipped", "Shipped"],
      maxResultsPerPage: 50
    });
  });
});
