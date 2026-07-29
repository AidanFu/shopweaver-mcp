import { extname, isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { ShopWeaverError } from "../errors.js";
import { analyzeAmazonSearchTermReportRows } from "./campaign-optimization.js";

export async function analyzeAmazonSearchTermReportFile(filePath: string) {
  return analyzeAmazonSearchTermReportRows(await readAmazonSearchTermReportRows(filePath));
}

export async function writeAmazonSearchTermOptimizationWorkbook(reportFilePath: string, outputPath: string) {
  if (!isAbsolute(outputPath)) throw new ShopWeaverError("AMAZON_ADS_OUTPUT_PATH_INVALID", "Amazon Ads optimization workbook output path must be absolute.");
  const analysis = await analyzeAmazonSearchTermReportFile(reportFilePath);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    "Report Rows": analysis.rowCount,
    "Campaigns": analysis.campaignCount,
    "Total Spend": analysis.totalSpend,
    "Total Sales": analysis.totalSales,
    "Blended ACOS": analysis.blendedAcos,
    "Waste Search Terms": analysis.wasteSearchTerms.length,
    "Efficient Search Terms": analysis.efficientSearchTerms.length
  }]), "Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    ...analysis.wasteSearchTerms.map(term => ({
      "Priority": "high",
      "Action": "negative_exact_candidate",
      "Campaign ID": term.campaignId,
      "Campaign Name": term.campaignName,
      "Search Term": term.searchTerm,
      "Reason": "High spend/clicks with no orders.",
      "Approval Required": true
    })),
    ...analysis.recommendations
      .filter(recommendation => recommendation.actionType === "budget_watch")
      .map(recommendation => ({
        "Priority": recommendation.priority,
        "Action": recommendation.actionType,
        "Campaign ID": recommendation.campaignId,
        "Campaign Name": recommendation.campaignName,
        "Search Term": "",
        "Reason": "High campaign spend/clicks with no orders.",
        "Approval Required": recommendation.sellerApprovalRequired
      })),
    ...analysis.efficientSearchTerms.map(term => ({
      "Priority": "normal",
      "Action": "exact_match_or_bid_review",
      "Campaign ID": term.campaignId,
      "Campaign Name": term.campaignName,
      "Search Term": term.searchTerm,
      "Reason": "Orders with ACOS at or below 35%.",
      "Approval Required": true
    }))
  ]), "Action Plan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analysis.wasteSearchTerms.map(term => ({
    "Campaign ID": term.campaignId,
    "Campaign Name": term.campaignName,
    "Search Term": term.searchTerm,
    "Clicks": term.clicks,
    "Spend": term.spend,
    "Sales": term.sales,
    "Orders": term.orders,
    "Recommendation": term.recommendation
  }))), "Waste Search Terms");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analysis.efficientSearchTerms.map(term => ({
    "Campaign ID": term.campaignId,
    "Campaign Name": term.campaignName,
    "Search Term": term.searchTerm,
    "Clicks": term.clicks,
    "Spend": term.spend,
    "Sales": term.sales,
    "Orders": term.orders,
    "ACOS": term.acos,
    "Recommendation": term.recommendation
  }))), "Efficient Search Terms");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analysis.recommendations.map(recommendation => ({
    "Campaign ID": recommendation.campaignId,
    "Campaign Name": recommendation.campaignName,
    "Status": recommendation.status,
    "Priority": recommendation.priority,
    "Action Type": recommendation.actionType,
    "Recommendation": recommendation.recommendation,
    "Seller Approval Required": recommendation.sellerApprovalRequired
  }))), "Campaign Recommendations");
  XLSX.writeFile(workbook, outputPath);
  return {
    operation: "write_amazon_ads_search_term_optimization_workbook" as const,
    outputPath,
    rowCount: analysis.rowCount,
    wasteSearchTermCount: analysis.wasteSearchTerms.length,
    efficientSearchTermCount: analysis.efficientSearchTerms.length
  };
}

export async function readAmazonSearchTermReportRows(filePath: string): Promise<Array<Record<string, unknown>>> {
  if (!isAbsolute(filePath)) throw new ShopWeaverError("AMAZON_ADS_REPORT_PATH_INVALID", "Amazon Ads report path must be absolute.");
  const extension = extname(filePath).toLowerCase();
  if (extension === ".csv") return readCsvRows(await readFile(filePath, "utf8"));
  if (extension === ".xlsx" || extension === ".xls") {
    const workbook = XLSX.read(await readFile(filePath));
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" }) as Array<Record<string, unknown>>;
  }
  throw new ShopWeaverError("AMAZON_ADS_REPORT_TYPE_UNSUPPORTED", "Amazon Ads report file must be CSV, XLSX, or XLS.");
}

function readCsvRows(text: string): Array<Record<string, unknown>> {
  const rows = XLSX.read(text, { type: "string" });
  const firstSheet = rows.SheetNames[0];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json(rows.Sheets[firstSheet], { defval: "" }) as Array<Record<string, unknown>>;
}
