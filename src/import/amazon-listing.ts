import type { AmazonListingWorkbookRow } from "./excel.js";

type ImportedDriveProduct = {
  productName: string;
  rawChineseDescription: string;
  imageFolderName: string | null;
  imageCount: number;
  images: Array<{ id: string; name: string; mimeType: string }>;
};

function slugSku(productName: string): string {
  const normalized = productName.normalize("NFKD").replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "");
  const base = normalized || "PRODUCT";
  return `AMZ-${base.slice(0, 32).toUpperCase()}`;
}

function inferCategory(productName: string, description: string) {
  const text = `${productName} ${description}`.toLowerCase();
  if (text.includes("keychain") || text.includes("钥匙扣") || text.includes("挂包")) {
    return {
      amazonProductType: "KEYCHAIN",
      amazonCategoryPath: "Clothing, Shoes & Jewelry > Luggage & Travel Gear > Keychains",
      categoryConfidence: "medium"
    };
  }
  if (text.includes("plush") || text.includes("玩偶") || text.includes("amigurumi")) {
    return {
      amazonProductType: "TOY_FIGURE",
      amazonCategoryPath: "Toys & Games > Stuffed Animals & Plush Toys",
      categoryConfidence: "low"
    };
  }
  if (text.includes("ornament") || text.includes("挂件") || text.includes("holiday")) {
    return {
      amazonProductType: "HANGING_ORNAMENT",
      amazonCategoryPath: "Home & Kitchen > Home Decor Products > Hanging Ornaments",
      categoryConfidence: "low"
    };
  }
  return { amazonProductType: "", amazonCategoryPath: "", categoryConfidence: "low" };
}

function titleFor(category: ReturnType<typeof inferCategory>, productName: string): string {
  if (category.amazonProductType === "KEYCHAIN") return "Crochet Bag Charm Keychain, Handmade Mini Gift Accessory";
  if (category.amazonProductType === "TOY_FIGURE") return "Crochet Plush Collectible, Handmade Small Desk Decor Gift";
  if (category.amazonProductType === "HANGING_ORNAMENT") return "Crochet Hanging Ornament, Handmade Gift Decor Accent";
  return `${productName} Amazon Listing Draft`;
}

export function buildAmazonListingRows(products: ImportedDriveProduct[]): AmazonListingWorkbookRow[] {
  return products.map(product => {
    const category = inferCategory(product.productName, product.rawChineseDescription);
    const mainImageName = product.images[0]?.name;
    return {
      productName: product.productName,
      sourceChineseDescription: product.rawChineseDescription,
      imageFolder: product.imageFolderName ?? "",
      imageCount: product.imageCount,
      amazonProductType: category.amazonProductType,
      amazonCategoryPath: category.amazonCategoryPath,
      categoryConfidence: category.categoryConfidence,
      sku: slugSku(product.productName),
      parentSku: "",
      variationTheme: "",
      color: "",
      size: "",
      amazonTitle: titleFor(category, product.productName),
      bullet1: "Handmade crochet item designed for bags, keys, shelves, desks, gifting, and everyday display.",
      bullet2: "Soft textured yarn construction gives each piece a warm handmade look.",
      bullet3: "Compact size makes it easy to use as a small accessory, favor, or decorative accent.",
      bullet4: "Gift-ready option for birthdays, holidays, celebrations, party favors, and thank-you gifts.",
      bullet5: "Each item may have small handmade variations in shape, color placement, and detail.",
      productDescription: "Amazon-ready draft copy for review. Use the source product description and images to finalize category-specific details, materials, size, package dimensions, and compliance notes before submission.",
      backendSearchTerms: "crochet gift handmade charm accessory decor birthday holiday favor",
      targetCustomer: "Gift buyers, accessory shoppers, decor shoppers, and handmade-style product buyers",
      useCases: "Gift; bag charm; keychain; shelf decor; desk decor; party favor",
      mainImageNotes: mainImageName ? `Review ${mainImageName} as the main image candidate; create a clean product-focused image if needed.` : "Add a clear product-focused main image before Amazon submission.",
      lifestyleImageNotes: "Show real use context such as bag, keys, backpack, shelf, desk, gift packaging, or seasonal decor.",
      infographicImageNotes: "Create callouts for material, handmade texture, use case, giftability, care, and product details.",
      sizeImageNotes: "Add a size reference or dimensions graphic before Amazon submission.",
      aplusModule1Headline: "Small Handmade-Style Accent",
      aplusModule1Body: "Use this module to explain texture, detail, and everyday use.",
      aplusModule2Headline: "Made For Gifting",
      aplusModule2Body: "Use this module to position the product for holidays, birthdays, favors, and small thank-you gifts.",
      aplusModule3Headline: "Flexible Display And Carry",
      aplusModule3Body: "Use this module to show how the product works across bags, keys, shelves, desks, and decor moments.",
      adKeywordSeeds: "crochet gift, handmade gift, cute keychain, bag charm, desk decor, small gift",
      negativeKeywordSeeds: "digital, pattern, tutorial, wholesale, free",
      suggestedCampaignStructure: "Auto discovery campaign; Manual exact campaign for high-intent terms; Manual phrase campaign for discovery terms; Product targeting campaign after ASIN/category research",
      suggestedPrice: "",
      packageWeight: "",
      packageDimensions: "",
      inventory: "",
      complianceNotes: "Review Amazon product type, restricted products, age grading, choking hazard, material claims, and category-specific requirements before submission.",
      validationStatus: "needs_review",
      validationNotes: "Review Amazon category/product type before submission."
    };
  });
}
