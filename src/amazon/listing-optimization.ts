type AttributeValue = { value?: string };

export interface AmazonExistingListingInput {
  sku: string;
  summaries?: Array<{ itemName?: string; mainImage?: { link?: string } }>;
  attributes?: {
    bullet_point?: AttributeValue[];
    product_description?: AttributeValue[];
    generic_keyword?: AttributeValue[];
  };
  issues?: Array<{ code?: string; message?: string }>;
}

export interface AmazonExistingListingRecommendation {
  sku: string;
  status: "needs_listing_optimization" | "monitor_listing";
  priority: "high" | "normal";
  titleRecommendation: string;
  bulletRecommendation: string;
  descriptionRecommendation: string;
  backendSearchRecommendation: string;
  imageRecommendation: string;
  issueRecommendation: string;
  sellerApprovalRequired: true;
}

export function analyzeAmazonExistingListing(listing: AmazonExistingListingInput): AmazonExistingListingRecommendation {
  const title = listing.summaries?.[0]?.itemName ?? "";
  const bullets = listing.attributes?.bullet_point ?? [];
  const description = listing.attributes?.product_description?.[0]?.value ?? "";
  const backendTerms = listing.attributes?.generic_keyword?.map(entry => entry.value ?? "").filter(Boolean) ?? [];
  const mainImage = listing.summaries?.[0]?.mainImage?.link ?? "";
  const issues = listing.issues ?? [];
  const titleTooLong = title.length > 150;
  const sparseBackendTerms = backendTerms.join(" ").split(/\s+/).filter(Boolean).length < 8;
  const needsOptimization = title.length < 45 || titleTooLong || bullets.length < 5 || bullets.length > 5 || description.length < 60 || sparseBackendTerms || mainImage === "" || issues.length > 0;
  return {
    sku: listing.sku,
    status: needsOptimization ? "needs_listing_optimization" : "monitor_listing",
    priority: issues.length > 0 || bullets.length < 5 || mainImage === "" ? "high" : "normal",
    titleRecommendation: titleTooLong ? "Shorten title to improve scanability while preserving product type, installation type, material, size, and finish." : title.length < 45 ? "Rewrite title with product type, use case, and core buyer search terms." : "Keep title under review for search-term fit and conversion performance.",
    bulletRecommendation: bullets.length < 5 ? "Expand to five benefit-led bullets: three buyer benefits, one worry reducer, and one post-sale/giftability point." : bullets.length > 5 ? "Consolidate bullets to the five strongest benefit-led points: three buyer benefits, one worry reducer, and one post-sale/support point." : "Monitor bullet performance against search terms, conversion rate, and customer questions.",
    descriptionRecommendation: description.length < 60 ? "Rewrite description with use case, dimensions, material, installation, and buyer reassurance details." : "Monitor description performance against search terms, conversion rate, and customer questions.",
    backendSearchRecommendation: sparseBackendTerms ? "Expand backend search terms with relevant non-duplicative buyer phrases, synonyms, and use cases." : "Monitor backend search-term coverage against ad search-term reports.",
    imageRecommendation: mainImage === "" ? "Review main image and add scale, use-case, and detail images before increasing ad spend." : "Monitor image performance; add scale, use-case, and detail images if conversion weakens.",
    issueRecommendation: issues.length > 0 ? `Resolve Amazon listing issues before campaign scaling: ${issues.map(issue => issue.code).filter(Boolean).join(", ")}.` : "No active listing issues found in the fetched listing item.",
    sellerApprovalRequired: true
  };
}
