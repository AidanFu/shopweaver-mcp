import type { AmazonListingWorkbookRow } from "./excel.js";

type ImportedDriveProduct = {
  productName: string;
  rawChineseDescription: string;
  imageFolderName: string | null;
  imageCount: number;
  images: Array<{ id: string; name: string; mimeType: string }>;
};

function skuFor(index: number): string {
  return `AMZ-HMF-${String(index + 1).padStart(4, "0")}`;
}

const HANGING_MINI_FIGURE_CATEGORY = {
  amazonProductType: "HANDMADE_HANGING_MINI_FIGURE",
  amazonCategoryPath: "Handmade Products > Accessories > Bag, Backpack, Keychain & Car Hanging Mini Figures",
  categoryConfidence: "user_confirmed"
};

export function buildAmazonListingRows(products: ImportedDriveProduct[]): AmazonListingWorkbookRow[] {
  return products.map((product, index) => {
    const mainImageName = product.images[0]?.name;
    return {
      productName: product.productName,
      sourceChineseDescription: product.rawChineseDescription,
      imageFolder: product.imageFolderName ?? "",
      imageCount: product.imageCount,
      amazonProductType: HANGING_MINI_FIGURE_CATEGORY.amazonProductType,
      amazonCategoryPath: HANGING_MINI_FIGURE_CATEGORY.amazonCategoryPath,
      categoryConfidence: HANGING_MINI_FIGURE_CATEGORY.categoryConfidence,
      sku: skuFor(index),
      parentSku: "",
      variationTheme: "",
      color: "",
      size: "",
      amazonTitle: "Handmade Crochet Mini Figure Charm for Bag, Backpack, Keychain or Car Hanging Decor",
      bullet1: "Handmade crochet mini figure designed to hang from a bag, backpack, keychain, or car mirror.",
      bullet2: "Small lightweight charm adds a soft handmade accent without adding bulky weight.",
      bullet3: "Flexible hanging design works as a cute everyday accessory, car ornament, or gift add-on.",
      bullet4: "Gift-ready option for birthdays, holidays, party favors, stocking stuffers, and small thank-you gifts.",
      bullet5: "Each piece may have small handmade variations in shape, color placement, and detail.",
      productDescription: "Amazon-ready draft copy for a handmade crochet mini figure charm. Position the product as a small hanging accessory for bags, backpacks, keychains, or cars, and finalize dimensions, materials, package details, and compliance notes before submission.",
      backendSearchTerms: "crochet mini figure bag charm backpack charm keychain car hanging ornament handmade gift",
      targetCustomer: "Gift buyers, bag and backpack accessory shoppers, keychain shoppers, and car hanging decor shoppers",
      useCases: "Hang on bag; hang on backpack; use as keychain; hang in car",
      mainImageNotes: mainImageName ? `Review ${mainImageName} as the main image candidate; create a clean product-focused image if needed.` : "Add a clear product-focused main image before Amazon submission.",
      lifestyleImageNotes: "Show the mini figure hanging on a bag, backpack, keychain, and inside a car.",
      infographicImageNotes: "Create callouts for handmade crochet texture, hanging use, lightweight size, giftability, care, and product details.",
      sizeImageNotes: "Add a size reference or dimensions graphic before Amazon submission.",
      aplusModule1Headline: "Handmade Mini Figure Charm",
      aplusModule1Body: "Use this module to explain the crochet texture, character detail, and small hanging format.",
      aplusModule2Headline: "For Bags, Backpacks, Keys, And Cars",
      aplusModule2Body: "Use this module to show the same mini figure charm in its main hanging use cases.",
      aplusModule3Headline: "Small Gift With Personality",
      aplusModule3Body: "Use this module to position the product for birthdays, holidays, party favors, and small thank-you gifts.",
      adKeywordSeeds: "crochet bag charm, backpack charm, handmade keychain, car hanging ornament, mini figure charm, crochet gift",
      negativeKeywordSeeds: "digital, pattern, tutorial, wholesale, free",
      suggestedCampaignStructure: "Auto discovery campaign; Manual exact campaign for high-intent terms; Manual phrase campaign for discovery terms; Product targeting campaign after ASIN/category research",
      suggestedPrice: "",
      packageWeight: "",
      packageDimensions: "",
      inventory: "",
      complianceNotes: "Review Amazon handmade/category eligibility, exact product type, age grading, choking hazard, car-hanging safety language, material claims, and package requirements before submission.",
      validationStatus: "needs_review",
      validationNotes: "User confirmed product family. Validate the exact Amazon product type/category before API submission."
    };
  });
}
