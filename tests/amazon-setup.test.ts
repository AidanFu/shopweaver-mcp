import { describe, expect, it } from "vitest";
import { parseAmazonMarketplaceIds, parseAmazonRegion } from "../src/amazon/setup-inputs.js";

describe("Amazon setup input parsing", () => {
  it("normalizes supported SP-API regions", () => {
    expect(parseAmazonRegion("NA")).toBe("na");
    expect(parseAmazonRegion("eu")).toBe("eu");
    expect(parseAmazonRegion("fe")).toBe("fe");
  });

  it("rejects unsupported SP-API regions", () => {
    expect(() => parseAmazonRegion("us")).toThrow("Amazon SP-API region must be one of: na, eu, fe.");
  });

  it("parses comma separated marketplace IDs", () => {
    expect(parseAmazonMarketplaceIds("ATVPDKIKX0DER, A2EUQ1WTGCTBG2")).toEqual(["ATVPDKIKX0DER", "A2EUQ1WTGCTBG2"]);
  });
});
