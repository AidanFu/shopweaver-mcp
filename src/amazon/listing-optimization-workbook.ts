import { isAbsolute } from "node:path";
import * as XLSX from "xlsx";
import { ShopWeaverError } from "../errors.js";
import { analyzeAmazonExistingListing, buildAmazonListingCopyPatch, type AmazonExistingListingInput } from "./listing-optimization.js";

export interface AmazonExistingListingOptimizationWorkbookInput {
  outputPath: string;
  marketplaceId: string;
  productType: string;
  listings: AmazonExistingListingInput[];
}

export async function writeAmazonExistingListingOptimizationWorkbook(input: AmazonExistingListingOptimizationWorkbookInput) {
  if (!isAbsolute(input.outputPath)) throw new ShopWeaverError("AMAZON_EXISTING_LISTING_OUTPUT_PATH_INVALID", "Amazon existing listing optimization workbook output path must be absolute.");
  const rows = input.listings.map(listing => {
    const recommendation = analyzeAmazonExistingListing(listing);
    const patch = recommendation.optimizedTitle && recommendation.optimizedBullets && recommendation.optimizedDescription && recommendation.optimizedBackendSearchTerms
      ? buildAmazonListingCopyPatch({
        marketplaceId: input.marketplaceId,
        productType: input.productType,
        title: recommendation.optimizedTitle,
        bullets: recommendation.optimizedBullets,
        description: recommendation.optimizedDescription,
        backendSearchTerms: recommendation.optimizedBackendSearchTerms
      })
      : undefined;
    return { listing, recommendation, patch };
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map(({ recommendation }) => ({
    "SKU": recommendation.sku,
    "Status": recommendation.status,
    "Priority": recommendation.priority,
    "Title Recommendation": recommendation.titleRecommendation,
    "Bullet Recommendation": recommendation.bulletRecommendation,
    "Description Recommendation": recommendation.descriptionRecommendation,
    "Backend Search Recommendation": recommendation.backendSearchRecommendation,
    "Image Recommendation": recommendation.imageRecommendation,
    "Issue Recommendation": recommendation.issueRecommendation,
    "Seller Approval Required": recommendation.sellerApprovalRequired
  }))), "Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.flatMap(({ recommendation }) => [
    { "SKU": recommendation.sku, "Area": "title", "Recommendation": recommendation.titleRecommendation },
    { "SKU": recommendation.sku, "Area": "bullets", "Recommendation": recommendation.bulletRecommendation },
    { "SKU": recommendation.sku, "Area": "description", "Recommendation": recommendation.descriptionRecommendation },
    { "SKU": recommendation.sku, "Area": "backend_search_terms", "Recommendation": recommendation.backendSearchRecommendation },
    { "SKU": recommendation.sku, "Area": "images", "Recommendation": recommendation.imageRecommendation },
    { "SKU": recommendation.sku, "Area": "issues", "Recommendation": recommendation.issueRecommendation }
  ])), "Recommendations");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map(({ recommendation }) => ({
    "SKU": recommendation.sku,
    "Optimized Title": recommendation.optimizedTitle ?? "",
    "Bullet Count": recommendation.optimizedBullets?.length ?? 0,
    "Bullet 1": recommendation.optimizedBullets?.[0] ?? "",
    "Bullet 2": recommendation.optimizedBullets?.[1] ?? "",
    "Bullet 3": recommendation.optimizedBullets?.[2] ?? "",
    "Bullet 4": recommendation.optimizedBullets?.[3] ?? "",
    "Bullet 5": recommendation.optimizedBullets?.[4] ?? "",
    "Optimized Description": recommendation.optimizedDescription ?? "",
    "Optimized Backend Search Terms": recommendation.optimizedBackendSearchTerms ?? ""
  }))), "Optimized Copy");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.flatMap(({ recommendation, patch }) =>
    patch?.patches.map(item => ({
      "SKU": recommendation.sku,
      "Product Type": patch.productType,
      "Patch Op": item.op,
      "Patch Path": item.path,
      "Value Count": item.value.length,
      "Preview JSON": JSON.stringify(item.value)
    })) ?? []
  )), "Patch Preview");
  XLSX.writeFile(workbook, input.outputPath);
  return {
    operation: "write_amazon_existing_listing_optimization_workbook" as const,
    outputPath: input.outputPath,
    listingCount: input.listings.length,
    optimizedPatchCount: rows.filter(row => row.patch).length,
    applied: false
  };
}
