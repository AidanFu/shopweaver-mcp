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
  optimizedTitle?: string;
  optimizedBullets?: string[];
  optimizedDescription?: string;
  optimizedBackendSearchTerms?: string;
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
  const optimizedContent = optimizedTowelWarmerContent(title);
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
    ...optimizedContent,
    sellerApprovalRequired: true
  };
}

function optimizedTowelWarmerContent(title: string) {
  if (!/towel warmer|heated towel|towel rack/i.test(title)) return {};
  const color = title.match(/\((Gold|Black|Silver)\)/i)?.[1] ?? title.match(/\b(Gold|Black|Silver)\b/i)?.[1] ?? "Silver";
  return {
    optimizedTitle: `Electric Towel Warmer Rack, Wall Mount 3-Bar Stainless Steel, 38 in, ${capitalize(color)}`,
    optimizedBullets: [
      "Enjoy warm, dry towels after showers while adding a polished bathroom upgrade that feels more comfortable every day.",
      "Wall mounted 3-bar design helps save floor space and keeps towels organized in bathrooms, laundry rooms, or spa areas.",
      "304-grade stainless steel construction supports daily use, while the 38 inch vertical profile fits narrow wall spaces.",
      "Digital timer and plug-in or hardwired installation options help address worries about run time, wiring, and setup flexibility.",
      "Backed by seller support; review measurements and installation needs before purchase for the best fit in your bathroom."
    ],
    optimizedDescription: `Upgrade daily bathroom comfort with a wall mounted electric towel warmer rack designed to warm and dry towels while saving floor space. The 3-bar vertical design uses 304-grade stainless steel with a polished ${capitalize(color)} finish and a 38 inch profile for bathrooms, laundry rooms, spa areas, and compact wall spaces. A digital timer helps manage run time, and plug-in or hardwired installation options give flexibility for different setups. Review dimensions and installation requirements before purchase to confirm fit.`,
    optimizedBackendSearchTerms: "heated towel rail bathroom towel dryer wall towel warmer plug in hardwired spa towel rack electric towel holder vertical towel heater"
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
