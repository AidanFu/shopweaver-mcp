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

const ENGLISH_PRODUCT_NAMES = new Map([
  ["郁金香兔-紫色", "Purple Tulip Bunny"],
  ["郁金香兔-蓝色", "Blue Tulip Bunny"],
  ["郁金香兔-黄色", "Yellow Tulip Bunny"],
  ["郁金香兔-粉色", "Pink Tulip Bunny"],
  ["波利狗-绿色", "Green Tree Polly Dog"],
  ["樱桃小粉熊", "Pink Cherry Bear"],
  ["新郎新娘兔", "Bride and Groom Bunny Set"],
  ["爱心猪", "Heart Pig Dumpling"],
  ["兔耳朵挂件", "Bunny Ear Gourd"],
  ["小糖葫芦", "Candied Hawthorn Dumpling"],
  ["双胞胎樱桃", "Twin Cherry Dumpling"],
  ["垂耳小兔", "Lop Bunny with Knit Hood"],
  ["垂耳小兔粉红色", "Pink Hood Lop Bunny"],
  ["垂耳小兔紫色", "Purple Hood Lop Bunny"],
  ["垂耳小兔橙色", "Orange Hood Lop Bunny"],
  ["中国红小兔", "Red China Sport Bunny"],
  ["中国绿小兔", "Green China Sport Bunny"],
  ["胡萝卜耳朵兔子", "Carrot Ear Bunny"],
  ["圣诞树团子", "Christmas Tree Dumpling"],
  ["双层圣诞团子", "Double Christmas Santa Dumpling"],
  ["冬日小雪人", "Winter Snowman"],
  ["樱桃小白熊", "White Cherry Bear"],
  ["圣诞树摆件", "Mini Christmas Tree"],
  ["圣诞老人挂件", "Santa Claus Charm"],
  ["圣诞老人摆件", "Santa Claus Figure"],
  ["粉色草莓小猪摆件", "Pink Strawberry Pig"],
  ["红草莓小猪摆件", "Red Strawberry Pig"],
  ["白衣藏青裤小兔", "Navy School Uniform Bunny"],
  ["小圣诞老人挂件", "Mini Santa Claus Charm"],
  ["白衣蓝裤小兔", "Blue School Uniform Bunny"],
  ["软萌圣诞树团子", "Red Christmas Tree Dumpling"],
  ["圣诞小树团子手工钩织钥匙扣", "Mini Christmas Tree Dumpling"],
  ["圆润奶白团子", "Cream Dumpling with Candy"],
  ["米白色牛奶棉钩织小兔", "Purple Dress Bunny"],
  ["米白渐变浅粉垂耳小兔", "Gradient Pink Lop Bunny"],
  ["双马尾毕业女孩钩织挂件", "Graduation Girl with Pigtails"],
  ["眼镜毕业女孩钩织挂件", "Graduation Girl with Glasses"],
  ["卷毛男孩毕业钩织挂件", "Graduation Boy with Curls"]
]);

const HANGING_MINI_FIGURE_CATEGORY = {
  amazonProductType: "HANDMADE_HANGING_MINI_FIGURE",
  amazonCategoryPath: "Handmade Products > Accessories > Bag, Backpack, Keychain & Car Hanging Mini Figures",
  categoryConfidence: "user_confirmed"
};

function englishProductName(productName: string): string {
  return ENGLISH_PRODUCT_NAMES.get(productName) ?? "Handmade Mini Figure";
}

function hasCuratedName(productName: string): boolean {
  return ENGLISH_PRODUCT_NAMES.has(productName);
}

function hasOccasion(name: string, keyword: string): boolean {
  return name.toLowerCase().includes(keyword);
}

function occasionPhrase(name: string): string {
  if (hasOccasion(name, "christmas") || hasOccasion(name, "snowman") || hasOccasion(name, "santa")) return "holiday gifting, stocking stuffers, and festive bag decor";
  if (hasOccasion(name, "graduation")) return "graduation gifts, school celebrations, and backpack decor";
  if (hasOccasion(name, "bride") || hasOccasion(name, "groom")) return "wedding gifts, couple keepsakes, and celebration favors";
  if (hasOccasion(name, "bunny") || hasOccasion(name, "bear") || hasOccasion(name, "pig") || hasOccasion(name, "dog")) return "birthdays, party favors, and everyday cute accessory gifts";
  return "birthdays, holidays, party favors, and small thank-you gifts";
}

function optimizedTitle(name: string): string {
  const title = `${name} Crochet Charm for Bag, Keychain or Car`;
  return title.length <= 75 ? title : `${name} Crochet Bag Charm`;
}

function backendTerms(name: string): string {
  return `${name.toLowerCase()} crochet charm bag charm backpack charm keychain car hanging ornament handmade gift`;
}

function extractDimensions(description: string) {
  const compact = description.replace(/\s+/g, "");
  const match = compact.match(/高(\d+(?:\.\d+)?)cm宽(\d+(?:\.\d+)?)cm/i);
  if (!match) return null;
  return { heightCm: match[1], widthCm: match[2], depthCm: "2" };
}

const DEFAULT_DIMENSIONS = { heightCm: "10", widthCm: "6", depthCm: "2" };

function titleQualityNotes(title: string): string {
  if (title.length > 75) return "Title exceeds 75 characters.";
  if (new Set(title.toLowerCase().split(/\s+/)).size < 5) return "Title may be too generic.";
  return "OK";
}

function copyQualityScore(row: Pick<AmazonListingWorkbookRow, "amazonTitle" | "bullet1" | "bullet2" | "bullet3" | "bullet4" | "bullet5" | "productDescription" | "backendSearchTerms">, curatedName: boolean): number {
  let score = 95;
  if (!curatedName) score -= 20;
  if ((row.amazonTitle?.length ?? 0) > 75) score -= 15;
  for (const value of [row.bullet1, row.bullet2, row.bullet3, row.bullet4, row.bullet5, row.productDescription, row.backendSearchTerms]) {
    if (!value) score -= 10;
  }
  return Math.max(score, 0);
}

function reviewPriority(score: number, titleNotes: string, curatedName: boolean): string {
  if (!curatedName || titleNotes !== "OK" || score < 80) return "high";
  return "normal";
}

export function buildAmazonListingRows(products: ImportedDriveProduct[]): AmazonListingWorkbookRow[] {
  return products.map((product, index) => {
    const mainImageName = product.images[0]?.name;
    const name = englishProductName(product.productName);
    const curatedName = hasCuratedName(product.productName);
    const extractedDimensions = extractDimensions(product.rawChineseDescription);
    const dimensions = extractedDimensions ?? DEFAULT_DIMENSIONS;
    const size = dimensions ? `${dimensions.heightCm} cm H x ${dimensions.widthCm} cm W` : "";
    const validationNotes = [
      "User confirmed product family.",
      extractedDimensions ? "Package depth uses 2 cm placeholder; verify before API submission." : "Default dimensions used; update with measured size before submission.",
      "Validate the exact Amazon product type/category before API submission."
    ].join(" ");
    const row: AmazonListingWorkbookRow = {
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
      size,
      amazonTitle: optimizedTitle(name),
      bullet1: `Handmade crochet ${name} mini figure designed for bags, backpacks, keys, or car display.`,
      bullet2: "Lightweight hanging charm adds personality without making bags or keys feel bulky.",
      bullet3: "Soft crochet texture works as a bag accent, keychain detail, or car ornament.",
      bullet4: `Gift-ready choice for ${occasionPhrase(name)}.`,
      bullet5: "Each piece may have small handmade variations in shape, color placement, and detail.",
      productDescription: `The ${name} is a handmade crochet mini figure charm for customers who want a small accessory with character. It is designed for bags, backpacks, keychains, or cars, making it useful for ${occasionPhrase(name)}. Review final dimensions, materials, package details, and compliance notes before Amazon submission.`,
      backendSearchTerms: backendTerms(name),
      targetCustomer: "Gift buyers, bag and backpack accessory shoppers, keychain shoppers, and car hanging decor shoppers",
      useCases: "Hang on bag; hang on backpack; use as keychain; hang in car",
      mainImageNotes: mainImageName ? `Review ${mainImageName} as the main image candidate; create a clean product-focused image if needed.` : "Add a clear product-focused main image before Amazon submission.",
      lifestyleImageNotes: "Show the mini figure hanging on a bag, backpack, keychain, and inside a car.",
      infographicImageNotes: "Create callouts for handmade crochet texture, hanging use, lightweight size, giftability, care, and product details.",
      sizeImageNotes: extractedDimensions ? `Add a size reference graphic showing ${size}.` : `Add a size reference graphic showing ${size}; this is a default estimate.`,
      aplusModule1Headline: "Handmade Mini Figure Charm",
      aplusModule1Body: "Use this module to explain the crochet texture, character detail, and small hanging format.",
      aplusModule2Headline: "For Bags, Backpacks, Keys, And Cars",
      aplusModule2Body: "Use this module to show the same mini figure charm in its main hanging use cases.",
      aplusModule3Headline: "Small Gift With Personality",
      aplusModule3Body: "Use this module to position the product for birthdays, holidays, party favors, and small thank-you gifts.",
      adKeywordSeeds: "crochet bag charm, backpack charm, handmade keychain, car hanging ornament, mini figure charm, crochet gift",
      negativeKeywordSeeds: "digital, pattern, tutorial, wholesale, free",
      suggestedCampaignStructure: "Auto discovery campaign; Manual exact campaign for high-intent terms; Manual phrase campaign for discovery terms; Product targeting campaign after ASIN/category research",
      suggestedPrice: "49.99",
      packageWeight: "6 oz",
      packageDimensions: `${dimensions.heightCm} x ${dimensions.widthCm} x ${dimensions.depthCm} cm`,
      inventory: 5,
      complianceNotes: "Review Amazon handmade/category eligibility, exact product type, age grading, choking hazard, car-hanging safety language, material claims, and package requirements before submission.",
      validationStatus: "needs_review",
      validationNotes
    };
    const amazonTitleLength = row.amazonTitle?.length ?? 0;
    const amazonTitleQualityNotes = titleQualityNotes(row.amazonTitle ?? "");
    const listingCopyQualityScore = copyQualityScore(row, curatedName);
    return {
      ...row,
      amazonTitleLength,
      amazonTitleQualityNotes,
      listingCopyQualityScore,
      productNameTranslationNotes: curatedName ? `Curated English product name: ${name}.` : "Fallback English product name used; review translation.",
      manualReviewPriority: extractedDimensions ? reviewPriority(listingCopyQualityScore, amazonTitleQualityNotes, curatedName) : "high"
    };
  });
}
