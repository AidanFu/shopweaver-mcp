import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import * as XLSX from "xlsx";
import { ShopWeaverError } from "../errors.js";
import { analyzeAmazonExistingListing, buildAmazonListingCopyPatch, type AmazonExistingListingInput } from "./listing-optimization.js";

export interface AmazonExistingListingOptimizationWorkbookInput {
  outputPath: string;
  marketplaceId: string;
  productType: string;
  listings: AmazonExistingListingInput[];
  salesSignals?: AmazonExistingListingSalesSignal[];
}

export interface AmazonExistingListingSalesSignal {
  sku: string;
  signal: "matched_ads_and_seller_sales" | "ads_attributed_without_seller_order" | "seller_order_without_ads_attribution" | "no_ads_or_seller_sales";
  adSpend?: number;
  sellerOrders?: number;
  adsOrders?: number;
}

export async function writeAmazonExistingListingOptimizationWorkbook(input: AmazonExistingListingOptimizationWorkbookInput) {
  if (!isAbsolute(input.outputPath)) throw new ShopWeaverError("AMAZON_EXISTING_LISTING_OUTPUT_PATH_INVALID", "Amazon existing listing optimization workbook output path must be absolute.");
  const salesSignals = new Map((input.salesSignals ?? []).map(signal => [signal.sku, signal]));
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
    return { listing, recommendation, patch, salesSignal: salesSignals.get(recommendation.sku) };
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.map(({ recommendation, salesSignal }) => ({
    "SKU": recommendation.sku,
    "Status": recommendation.status,
    "Priority": recommendation.priority,
    "Sales Signal": salesSignal?.signal ?? "",
    "Listing Sales Action Focus": salesSignal ? listingSalesAction(salesSignal).focus : "",
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
    "Optimized Backend Search Terms": recommendation.optimizedBackendSearchTerms ?? "",
    "Decision": "",
    "Reviewed By": "",
    "Review Notes": ""
  }))), "Optimized Copy");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { "Decision": "approve", "Meaning": "Approved for a future Amazon listing copy write after a final confirmation gate." },
    { "Decision": "reject", "Meaning": "Do not apply this listing copy recommendation." },
    { "Decision": "defer", "Meaning": "Review again after more listing, sales, or advertising data is available." }
  ]), "Decision Options");
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
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.flatMap(({ recommendation, salesSignal }) =>
    salesSignal ? listingSalesAction(salesSignal).actions.map(action => ({
      "SKU": recommendation.sku,
      "Signal": salesSignal.signal,
      "Ad Spend": salesSignal.adSpend ?? "",
      "Seller Orders": salesSignal.sellerOrders ?? "",
      "Ads Orders": salesSignal.adsOrders ?? "",
      "Focus": listingSalesAction(salesSignal).focus,
      "Action": action
    })) : []
  )), "Sales Signal Actions");
  XLSX.writeFile(workbook, input.outputPath);
  return {
    operation: "write_amazon_existing_listing_optimization_workbook" as const,
    outputPath: input.outputPath,
    listingCount: input.listings.length,
    optimizedPatchCount: rows.filter(row => row.patch).length,
    applied: false
  };
}

export async function readAmazonExistingListingCopyDecisions(filePath: string) {
  if (!isAbsolute(filePath)) throw new ShopWeaverError("AMAZON_EXISTING_LISTING_REVIEW_PATH_INVALID", "Amazon existing listing reviewed workbook path must be absolute.");
  const workbook = XLSX.read(await readFile(filePath));
  const sheet = workbook.Sheets["Optimized Copy"];
  if (!sheet) throw new ShopWeaverError("AMAZON_EXISTING_LISTING_OPTIMIZED_COPY_MISSING", "Amazon existing listing reviewed workbook must include an Optimized Copy sheet.");
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, unknown>>;
  const reviewedRows = rows.map(reviewedDecision).filter(row => row.decision);
  const invalidDecisions = reviewedRows
    .filter(row => !["approve", "reject", "defer"].includes(row.decision))
    .map(row => ({
      sku: row.sku,
      decision: row.decision,
      reviewNotes: row.reviewNotes,
      error: "Decision must be approve, reject, or defer."
    }));
  const decisions = reviewedRows
    .filter(row => ["approve", "reject", "defer"].includes(row.decision))
    .filter(row => !invalidDecisions.some(invalid => invalid.sku === row.sku));
  return {
    operation: "read_amazon_existing_listing_copy_decisions" as const,
    reviewedListingCount: decisions.length,
    invalidDecisionCount: invalidDecisions.length,
    decisions,
    invalidDecisions
  };
}

export async function previewAmazonExistingListingApprovedCopyUpdates(filePath: string, input: { marketplaceId: string; productType: string }) {
  const review = await readAmazonExistingListingCopyDecisions(filePath);
  const patches = review.decisions
    .filter(row => row.decision === "approve")
    .map(row => ({
      sku: row.sku,
      patch: buildAmazonListingCopyPatch({
        marketplaceId: input.marketplaceId,
        productType: input.productType,
        title: row.title,
        bullets: row.bullets,
        description: row.description,
        backendSearchTerms: row.backendSearchTerms
      })
    }));
  return {
    operation: "preview_amazon_existing_listing_approved_copy_updates" as const,
    approvedListingCount: patches.length,
    applied: false,
    warning: "Preview only. No Amazon listing title, bullets, description, backend search terms, images, offers, inventory, or ads were changed.",
    patches,
    invalidDecisionCount: review.invalidDecisionCount,
    invalidDecisions: review.invalidDecisions
  };
}

function reviewedDecision(row: Record<string, unknown>) {
  return {
    sku: text(row.SKU),
    title: text(row["Optimized Title"]),
    bullets: [
      text(row["Bullet 1"]),
      text(row["Bullet 2"]),
      text(row["Bullet 3"]),
      text(row["Bullet 4"]),
      text(row["Bullet 5"])
    ].filter(Boolean),
    description: text(row["Optimized Description"]),
    backendSearchTerms: text(row["Optimized Backend Search Terms"]),
    decision: text(row.Decision).toLowerCase(),
    reviewedBy: text(row["Reviewed By"]),
    reviewNotes: text(row["Review Notes"])
  };
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function listingSalesAction(signal: AmazonExistingListingSalesSignal) {
  if (signal.signal === "matched_ads_and_seller_sales") {
    return {
      focus: "harvest_and_monitor",
      actions: [
        "Keep the current listing direction and harvest converting search terms into controlled exact or phrase targets.",
        "Monitor conversion, ACOS, and Seller order volume before making additional copy changes."
      ]
    };
  }
  if (signal.signal === "ads_attributed_without_seller_order") {
    return {
      focus: "reconcile_attribution_before_scaling",
      actions: [
        "Compare the Ads attribution window with Seller order dates before increasing this SKU budget.",
        "Keep listing copy changes conservative until Ads and Seller order data agree."
      ]
    };
  }
  if (signal.signal === "seller_order_without_ads_attribution") {
    return {
      focus: "protect_seller_order_signal",
      actions: [
        "Avoid cutting this SKU solely from weak Ads attribution because Seller orders exist.",
        "Use listing changes only for clear conversion gaps, not because Ads attribution is delayed."
      ]
    };
  }
  return {
    focus: "listing_conversion_review",
    actions: [
      "Review title, first image, price, coupon, and delivery promise before adding more traffic.",
      "Improve bullets around customer benefits, installation confidence, worry removal, and after-sale support.",
      "Add or revise A+ modules that show dimensions, use scenes, gift value, and trust signals."
    ]
  };
}
