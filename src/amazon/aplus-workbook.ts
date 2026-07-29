import * as XLSX from "xlsx";
import {
  analyzeAmazonAplusContent,
  buildOptimizedAmazonAplusContentDocument,
  type AmazonAplusContentInput,
  type AplusContentDocument,
  type AplusModule
} from "./aplus-optimization.js";

export interface AmazonAplusWorkbookItem extends AmazonAplusContentInput {
  expectedFinish: string;
  expectedHeightInches: number;
  sourceContentReferenceKey: string;
}

export interface AmazonAplusWorkbookInput {
  outputPath: string;
  items: AmazonAplusWorkbookItem[];
}

export async function writeAmazonAplusOptimizationWorkbook(input: AmazonAplusWorkbookInput) {
  const workbook = XLSX.utils.book_new();
  const optimizedItems = input.items.map(item => {
    const currentDocument = item.contentRecord.contentDocument;
    if (!currentDocument) throw new Error(`No A+ content document payload was found for ASIN ${item.asin}.`);
    const recommendation = analyzeAmazonAplusContent(item);
    const optimizedDocument = buildOptimizedAmazonAplusContentDocument(currentDocument as AplusContentDocument, {
      asin: item.asin,
      finish: item.expectedFinish,
      heightInches: item.expectedHeightInches
    });
    return { item, recommendation, optimizedDocument };
  });

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(optimizedItems.map(({ item, recommendation, optimizedDocument }) => ({
    "ASIN": item.asin,
    "Finish": item.expectedFinish,
    "Height Inches": item.expectedHeightInches,
    "Source Content Reference Key": item.sourceContentReferenceKey,
    "Content Status": recommendation.contentStatus,
    "Recommendation Status": recommendation.status,
    "Priority": recommendation.priority,
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
