import { isAbsolute } from "node:path";
import * as XLSX from "xlsx";
import { ShopWeaverError } from "../errors.js";
import { normalizeTowelWarmerFinish } from "./finish-normalization.js";

export interface AmazonBrandStoreProduct {
  asin: string;
  sku?: string;
  title: string;
  finish?: string;
  price?: number;
  imageUrl?: string;
  priority?: "hero" | "standard";
}

export interface AmazonBrandStoreSalesSignal {
  sku: string;
  signal: "matched_ads_and_seller_sales" | "ads_attributed_without_seller_order" | "seller_order_without_ads_attribution" | "no_ads_or_seller_sales";
  adSpend?: number;
  sellerOrders?: number;
  adsOrders?: number;
}

export interface AmazonBrandStoreInput {
  outputPath?: string;
  brandName: string;
  primaryCategory: string;
  products: AmazonBrandStoreProduct[];
  campaignInsights?: {
    efficientSearchTerms?: string[];
    wasteSearchTerms?: string[];
  };
  salesSignals?: AmazonBrandStoreSalesSignal[];
}

export interface AmazonBrandStoreSection {
  sectionType: "hero" | "benefit_grid" | "comparison" | "reassurance";
  headline: string;
  body: string;
  imageGuidance: string;
}

export interface AmazonBrandStoreProductTile {
  asin: string;
  sku: string;
  title: string;
  primaryMessage: string;
  callout: string;
  price?: number;
  imageUrl?: string;
  salesSignal?: AmazonBrandStoreSalesSignal["signal"];
  storeRole?: "lead_tile" | "supporting_tile" | "diagnostic_tile";
}

export function buildAmazonBrandStorePlan(input: AmazonBrandStoreInput) {
  const salesSignals = new Map((input.salesSignals ?? []).map(signal => [signal.sku, signal]));
  const products = [...input.products].sort((left, right) => productSignalRank(salesSignals.get(right.sku ?? "")) - productSignalRank(salesSignals.get(left.sku ?? "")));
  const sections = buildSections(input.primaryCategory);
  const efficientTerms = input.campaignInsights?.efficientSearchTerms ?? [];
  const wasteTerms = input.campaignInsights?.wasteSearchTerms ?? [];
  return {
    operation: "build_amazon_brand_store_plan" as const,
    brandName: input.brandName,
    primaryCategory: input.primaryCategory,
    productCount: products.length,
    sections,
    productTiles: products.map(product => productTile(product, salesSignals.get(product.sku ?? ""))),
    adLearningHooks: [
      ...(efficientTerms.length > 0 ? [{
        signal: "efficient_search_terms" as const,
        recommendation: `Use converting Sponsored Products terms in Store headline and tile copy: ${efficientTerms.slice(0, 5).join(", ")}.`
      }] : []),
      ...(wasteTerms.length > 0 ? [{
        signal: "waste_search_terms" as const,
        recommendation: `Avoid Store copy that attracts low-intent or free-seeking traffic: ${wasteTerms.slice(0, 5).join(", ")}.`
      }] : []),
      ...(input.salesSignals?.length ? [{
        signal: "store_sales_signal_review" as const,
        recommendation: "Use Store tile order to protect proven sellers first, then diagnose no-sale SKUs before giving them hero placement."
      }] : []),
      {
        signal: "weekly_review" as const,
        recommendation: "Compare Store traffic, Sponsored Products search terms, orders, and listing conversion before changing page structure."
      }
    ],
    warning: "Review only. No Amazon Brand Store, A+ Content, listing, or Ads change was submitted."
  };
}

export async function writeAmazonBrandStoreWorkbook(input: AmazonBrandStoreInput & { outputPath: string }) {
  if (!isAbsolute(input.outputPath)) throw new ShopWeaverError("AMAZON_BRAND_STORE_OUTPUT_PATH_INVALID", "Amazon Brand Store workbook output path must be absolute.");
  const plan = buildAmazonBrandStorePlan(input);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    "Brand Name": plan.brandName,
    "Primary Category": plan.primaryCategory,
    "Product Count": plan.productCount,
    "Warning": plan.warning
  }]), "Store Overview");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(plan.sections.map(section => ({
    "Section Type": section.sectionType,
    "Headline": section.headline,
    "Body": section.body,
    "Image Guidance": section.imageGuidance
  }))), "Homepage Sections");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(plan.productTiles.map(tile => ({
    "ASIN": tile.asin,
    "SKU": tile.sku,
    "Title": tile.title,
    "Primary Message": tile.primaryMessage,
    "Callout": tile.callout,
    "Price": tile.price ?? "",
    "Image URL": tile.imageUrl ?? "",
    "Sales Signal": tile.salesSignal ?? "",
    "Store Role": tile.storeRole ?? ""
  }))), "Product Tiles");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(plan.adLearningHooks.map(hook => ({
    "Signal": hook.signal,
    "Recommendation": hook.recommendation
  }))), "Ads Learning Hooks");
  XLSX.writeFile(workbook, input.outputPath);
  return {
    operation: "write_amazon_brand_store_workbook" as const,
    outputPath: input.outputPath,
    productCount: input.products.length
  };
}

function buildSections(category: string): AmazonBrandStoreSection[] {
  if (/towel warmer|heated towel|towel rack/i.test(category)) {
    return [
      {
        sectionType: "hero",
        headline: "Warmer, drier towels for everyday bathroom routines",
        body: "Present the collection around daily comfort, cleaner towel organization, and bathroom upgrades rather than only product specifications.",
        imageGuidance: "Use a bright bathroom lifestyle image that shows scale, wall placement, towels, timer, and finish clearly."
      },
      {
        sectionType: "benefit_grid",
        headline: "Choose by finish, fit, and installation plan",
        body: "Group shopper decisions around finish, wall space, plug-in or hardwired setup, and the routine they want to improve.",
        imageGuidance: "Use cropped detail images for finish, timer controls, wiring option, and towel placement."
      },
      {
        sectionType: "comparison",
        headline: "Find the towel warmer that fits your space",
        body: "Compare finish, height, bar count, installation style, and best room use so shoppers can decide without leaving the Store.",
        imageGuidance: "Use consistent product cutouts or lifestyle tiles with the same scale and background style."
      },
      {
        sectionType: "reassurance",
        headline: "Measure first, install with confidence",
        body: "Address common purchase worries around dimensions, wall mounting, timer use, support, and bathroom placement.",
        imageGuidance: "Use a simple measurement/installation visual and a support-focused close-up."
      }
    ];
  }
  return [
    {
      sectionType: "hero",
      headline: `Shop ${category} for everyday use`,
      body: "Lead with the core customer benefit and make product choice easy from the first screen.",
      imageGuidance: "Use a clear lifestyle image that shows the product in use, scale, and primary buying reason."
    },
    {
      sectionType: "benefit_grid",
      headline: "Compare the details that matter",
      body: "Organize the page around use case, fit, material, color or style, and buyer concerns.",
      imageGuidance: "Use consistent detail images that answer the most common purchase questions."
    },
    {
      sectionType: "reassurance",
      headline: "Buy with the right expectations",
      body: "Answer dimensions, setup, care, support, and post-sale questions before shoppers leave the page.",
      imageGuidance: "Use support, scale, and setup visuals instead of decorative-only imagery."
    }
  ];
}

function productTile(product: AmazonBrandStoreProduct, salesSignal?: AmazonBrandStoreSalesSignal): AmazonBrandStoreProductTile {
  const salesGuidance = salesSignal ? productTileSalesGuidance(salesSignal) : undefined;
  const finish = product.finish ? normalizeTowelWarmerFinish(product.finish) : undefined;
  return {
    asin: product.asin,
    sku: product.sku ?? "",
    title: product.title,
    primaryMessage: finish ? `${finish} finish for a polished bathroom upgrade` : "Designed for clear comparison and confident purchase decisions",
    callout: salesGuidance?.callout ?? (product.priority === "hero" ? "Feature in the first product row and connect to top converting ad terms." : "Place in comparison rows after the hero product."),
    ...(product.price !== undefined ? { price: product.price } : {}),
    ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
    ...(salesSignal ? { salesSignal: salesSignal.signal } : {}),
    ...(salesGuidance ? { storeRole: salesGuidance.storeRole } : {})
  };
}

function productSignalRank(signal?: AmazonBrandStoreSalesSignal): number {
  if (!signal) return 1;
  if (signal.signal === "matched_ads_and_seller_sales") return 4;
  if (signal.signal === "seller_order_without_ads_attribution") return 3;
  if (signal.signal === "ads_attributed_without_seller_order") return 2;
  return 0;
}

function productTileSalesGuidance(signal: AmazonBrandStoreSalesSignal) {
  if (signal.signal === "matched_ads_and_seller_sales") {
    return {
      storeRole: "lead_tile" as const,
      callout: "Feature early in the Store because Ads and Seller orders both show recent demand."
    };
  }
  if (signal.signal === "seller_order_without_ads_attribution") {
    return {
      storeRole: "lead_tile" as const,
      callout: "Feature early enough to protect Seller-order demand while checking why Ads attribution is weak."
    };
  }
  if (signal.signal === "ads_attributed_without_seller_order") {
    return {
      storeRole: "supporting_tile" as const,
      callout: "Keep as a supporting tile until Ads attribution and Seller order data are reconciled."
    };
  }
  return {
    storeRole: "diagnostic_tile" as const,
    callout: "Keep visible for comparison, but review listing promise, image, price, and campaign traffic before making it the hero tile."
  };
}
