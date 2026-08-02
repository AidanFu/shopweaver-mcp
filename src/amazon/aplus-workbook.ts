import * as XLSX from "xlsx";
import {
  analyzeAmazonAplusContent,
  buildOptimizedAmazonAplusContentDocument,
  type AmazonAplusContentInput,
  type AplusContentDocument,
  type AplusModule
} from "./aplus-optimization.js";

export interface AmazonAplusWorkbookItem extends AmazonAplusContentInput {
  sku?: string;
  expectedFinish: string;
  expectedHeightInches: number;
  sourceContentReferenceKey: string;
  salesSignal?: AmazonAplusSalesSignal;
}

export interface AmazonAplusWorkbookInput {
  outputPath: string;
  items: AmazonAplusWorkbookItem[];
  salesSignals?: AmazonAplusSalesSignal[];
}

export interface AmazonAplusSalesSignal {
  asin?: string;
  sku?: string;
  signal: "matched_ads_and_seller_sales" | "ads_attributed_without_seller_order" | "seller_order_without_ads_attribution" | "no_ads_or_seller_sales";
  adSpend?: number;
  sellerOrders?: number;
  adsOrders?: number;
}

export async function writeAmazonAplusOptimizationWorkbook(input: AmazonAplusWorkbookInput) {
  const workbook = XLSX.utils.book_new();
  const salesSignals = buildSalesSignalLookup(input.salesSignals ?? []);
  const optimizedItems = input.items.map(item => {
    const currentDocument = item.contentRecord.contentDocument;
    if (!currentDocument) throw new Error(`No A+ content document payload was found for ASIN ${item.asin}.`);
    const recommendation = analyzeAmazonAplusContent(item);
    const optimizedDocument = buildOptimizedAmazonAplusContentDocument(currentDocument as AplusContentDocument, {
      asin: item.asin,
      finish: item.expectedFinish,
      heightInches: item.expectedHeightInches
    });
    return { item, recommendation, optimizedDocument, salesSignal: item.salesSignal ?? salesSignals.get(item.asin) ?? salesSignals.get(item.sku ?? "") };
  });

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(optimizedItems.map(({ item, recommendation, optimizedDocument, salesSignal }) => ({
    "ASIN": item.asin,
    "SKU": item.sku ?? "",
    "Finish": item.expectedFinish,
    "Height Inches": item.expectedHeightInches,
    "Source Content Reference Key": item.sourceContentReferenceKey,
    "Content Status": recommendation.contentStatus,
    "Recommendation Status": recommendation.status,
    "Priority": recommendation.priority,
    "Sales Signal": salesSignal?.signal ?? "",
    "A+ Sales Action Focus": salesSignal ? aplusSalesAction(salesSignal).focus : "",
    "Module Count": recommendation.moduleCount,
    "Empty Overlay Modules": recommendation.emptyOverlayModuleCount,
    "Generic Alt Text": recommendation.genericAltTextCount,
    "Optimized Document Name": optimizedDocument.name
  }))), "Summary");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(optimizedItems.flatMap(({ item, recommendation }) =>
    recommendation.recommendations.map(value => ({
      "ASIN": item.asin,
      "Priority": recommendation.priority,
      "Recommendation": value
    }))
  )), "Recommendations");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(optimizedItems.flatMap(({ item, recommendation }) =>
    recommendation.proposedModulePlan.map((value, index) => ({
      "ASIN": item.asin,
      "Sequence": index + 1,
      "Plan": value
    }))
  )), "Proposed Module Plan");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(optimizedItems.map(({ item, optimizedDocument }) => ({
    "ASIN": item.asin,
    "Description": productDescription(optimizedDocument)
  }))), "Product Description");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(optimizedItems.flatMap(({ item, optimizedDocument }) =>
    optimizedDocument.contentModuleList
      .map((module, index) => ({ module, index }))
      .filter(({ module }) => module.contentModuleType === "STANDARD_IMAGE_TEXT_OVERLAY")
      .map(({ module, index }) => ({
        "ASIN": item.asin,
        "Module Index": index,
        "Headline": module.standardImageTextOverlay?.block?.headline?.value ?? "",
        "Body": module.standardImageTextOverlay?.block?.body?.textList?.[0]?.value ?? "",
        "Alt Text": module.standardImageTextOverlay?.block?.image?.altText ?? ""
      }))
  )), "Optimized Overlay Copy");

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(optimizedItems.flatMap(({ item, salesSignal }) =>
    salesSignal ? [{
      "ASIN": item.asin,
      "SKU": item.sku ?? "",
      "Signal": salesSignal.signal,
      "Ad Spend": salesSignal.adSpend ?? "",
      "Seller Orders": salesSignal.sellerOrders ?? "",
      "Ads Orders": salesSignal.adsOrders ?? "",
      "Focus": aplusSalesAction(salesSignal).focus,
      "Action": aplusSalesAction(salesSignal).action
    }] : []
  )), "Sales Signal Actions");

  XLSX.writeFile(workbook, input.outputPath);
  return {
    operation: "write_amazon_aplus_optimization_workbook" as const,
    outputPath: input.outputPath,
    asinCount: input.items.length
  };
}

function productDescription(document: AplusContentDocument): string {
  return document.contentModuleList
    .map((module: AplusModule) => module.standardProductDescription?.body?.textList?.map(entry => entry.value ?? "").join(" ") ?? "")
    .find(Boolean) ?? "";
}

function aplusSalesAction(signal: AmazonAplusSalesSignal) {
  if (signal.signal === "matched_ads_and_seller_sales") {
    return {
      focus: "protect_winning_message",
      action: "Keep the current A+ direction stable and only test one module at a time after enough traffic accumulates."
    };
  }
  if (signal.signal === "seller_order_without_ads_attribution") {
    return {
      focus: "protect_seller_order_message",
      action: "Keep trust and comparison modules visible because Seller orders exist, then investigate why Ads attribution is weak."
    };
  }
  if (signal.signal === "ads_attributed_without_seller_order") {
    return {
      focus: "reconcile_before_aplus_expansion",
      action: "Reconcile the Ads attribution window and Seller order window before expanding A+ tests or increasing paid traffic."
    };
  }
  return {
    focus: "conversion_trust_rebuild",
    action: "Prioritize A+ modules that explain benefit, installation fit, dimensions, warranty/support, and real bathroom use before sending more paid traffic."
  };
}

function buildSalesSignalLookup(signals: AmazonAplusSalesSignal[]): Map<string, AmazonAplusSalesSignal> {
  const lookup = new Map<string, AmazonAplusSalesSignal>();
  for (const signal of signals) {
    if (signal.asin) lookup.set(signal.asin, signal);
    if (signal.sku) lookup.set(signal.sku, signal);
  }
  return lookup;
}
