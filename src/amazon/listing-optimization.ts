type AttributeValue = { value?: string };

export interface AmazonExistingListingInput {
  sku: string;
  summaries?: Array<{ itemName?: string; mainImage?: { link?: string } }>;
  attributes?: {
    bullet_point?: AttributeValue[];
    product_description?: AttributeValue[];
  };
  issues?: Array<{ code?: string; message?: string }>;
}

export interface AmazonExistingListingRecommendation {
  sku: string;
  status: "needs_listing_optimization" | "monitor_listing";
  priority: "high" | "normal";
  titleRecommendation: string;
  bulletRecommendation: string;
  imageRecommendation: string;
  issueRecommendation: string;
  sellerApprovalRequired: true;
}

export function analyzeAmazonExistingListing(listing: AmazonExistingListingInput): AmazonExistingListingRecommendation {
  const title = listing.summaries?.[0]?.itemName ?? "";
  const bullets = listing.attributes?.bullet_point ?? [];
  const description = listing.attributes?.product_description?.[0]?.value ?? "";
  const mainImage = listing.summaries?.[0]?.mainImage?.link ?? "";
  const issues = listing.issues ?? [];
  const needsOptimization = title.length < 45 || bullets.length < 5 || description.length < 60 || mainImage === "" || issues.length > 0;
  return {
    sku: listing.sku,
    status: needsOptimization ? "needs_listing_optimization" : "monitor_listing",
    priority: issues.length > 0 || bullets.length < 5 || mainImage === "" ? "high" : "normal",
    titleRecommendation: needsOptimization ? "Rewrite title with product type, use case, and core buyer search terms." : "Keep title under review for search-term fit and conversion performance.",
    bulletRecommendation: bullets.length < 5 ? "Expand to five benefit-led bullets: three buyer benefits, one worry reducer, and one post-sale/giftability point." : "Monitor bullet performance against search terms, conversion rate, and customer questions.",
    imageRecommendation: mainImage === "" ? "Review main image and add scale, use-case, and detail images before increasing ad spend." : "Monitor image performance; add scale, use-case, and detail images if conversion weakens.",
    issueRecommendation: issues.length > 0 ? `Resolve Amazon listing issues before campaign scaling: ${issues.map(issue => issue.code).filter(Boolean).join(", ")}.` : "No active listing issues found in the fetched listing item.",
    sellerApprovalRequired: true
  };
}
