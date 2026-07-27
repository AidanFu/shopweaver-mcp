import { ShopWeaverError } from "../errors.js";

export function parseAmazonRegion(value: string): "na" | "eu" | "fe" {
  const region = value.trim().toLowerCase();
  if (region === "na" || region === "eu" || region === "fe") return region;
  throw new ShopWeaverError("AMAZON_SP_API_REGION_INVALID", "Amazon SP-API region must be one of: na, eu, fe.");
}

export function parseAmazonAdsRegion(value: string): "na" | "eu" | "fe" {
  const region = value.trim().toLowerCase();
  if (region === "na" || region === "eu" || region === "fe") return region;
  throw new ShopWeaverError("AMAZON_ADS_REGION_INVALID", "Amazon Ads API region must be one of: na, eu, fe.");
}

export function parseAmazonMarketplaceIds(value: string): string[] {
  return value.split(",").map(entry => entry.trim()).filter(Boolean);
}
