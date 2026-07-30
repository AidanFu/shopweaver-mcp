import { extname, isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { ShopWeaverError } from "../errors.js";
import { analyzeAmazonSearchTermReportRows, type AmazonSearchTermReportAnalysis } from "./campaign-optimization.js";

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
      "Action ID": actionId("negative_exact_candidate", "ad_group", term.campaignId, term.adGroupId, term.searchTerm),
      "Priority": "high",
      "Action": "negative_exact_candidate",
      "Scope": "ad_group",
      "Proposed Change": "Add search term as ad group negative exact after review.",
      "Campaign ID": term.campaignId,
      "Campaign Name": term.campaignName,
      "Ad Group ID": term.adGroupId,
      "Ad Group Name": term.adGroupName,
      "Match Type": term.matchType,
      "Targeting": term.targeting,
      "Search Term": term.searchTerm,
      "Clicks": term.clicks,
      "Spend": term.spend,
      "Sales": term.sales,
      "Orders": term.orders,
      "ACOS": "",
      "Reason": "High spend/clicks with no orders.",
      "Approval Required": true,
      "Decision": "",
      "Reviewed By": "",
      "Review Notes": ""
    })),
    ...analysis.recommendations
      .filter(recommendation => recommendation.actionType === "budget_watch")
      .map(recommendation => {
        const campaign = campaignMetrics(analysis, recommendation.campaignId);
        return {
          "Action ID": actionId(recommendation.actionType, "campaign", recommendation.campaignId),
          "Priority": recommendation.priority,
          "Action": recommendation.actionType,
          "Scope": "campaign",
          "Proposed Change": "Review reducing or capping campaign budget until waste terms are handled.",
          "Campaign ID": recommendation.campaignId,
          "Campaign Name": recommendation.campaignName,
          "Ad Group ID": "",
          "Ad Group Name": "",
          "Match Type": "",
          "Targeting": "",
          "Search Term": "",
          "Clicks": campaign.clicks,
          "Spend": campaign.spend,
          "Sales": campaign.sales,
          "Orders": campaign.orders,
          "ACOS": campaign.acos || "",
          "Reason": "High campaign spend/clicks with no orders.",
          "Approval Required": recommendation.sellerApprovalRequired,
          "Decision": "",
          "Reviewed By": "",
          "Review Notes": ""
        };
      }),
    ...analysis.efficientSearchTerms.map(term => ({
      "Action ID": actionId("exact_match_or_bid_review", "ad_group", term.campaignId, term.adGroupId, term.searchTerm),
      "Priority": "normal",
      "Action": "exact_match_or_bid_review",
      "Scope": "ad_group",
      "Proposed Change": "Review search term for exact keyword promotion or modest bid increase.",
      "Campaign ID": term.campaignId,
      "Campaign Name": term.campaignName,
      "Ad Group ID": term.adGroupId,
      "Ad Group Name": term.adGroupName,
      "Match Type": term.matchType,
      "Targeting": term.targeting,
      "Search Term": term.searchTerm,
      "Clicks": term.clicks,
      "Spend": term.spend,
      "Sales": term.sales,
      "Orders": term.orders,
      "ACOS": term.acos,
      "Reason": "Orders with ACOS at or below 35%.",
      "Approval Required": true,
      "Decision": "",
      "Reviewed By": "",
      "Review Notes": ""
    }))
  ]), "Action Plan");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { "Decision": "approve", "Meaning": "Approved for a future Amazon Ads write after a final confirmation gate." },
    { "Decision": "reject", "Meaning": "Do not apply this recommendation." },
    { "Decision": "defer", "Meaning": "Review again after more campaign data is available." }
  ]), "Decision Options");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analysis.wasteSearchTerms.map(term => ({
    "Campaign ID": term.campaignId,
    "Campaign Name": term.campaignName,
    "Ad Group ID": term.adGroupId,
    "Ad Group Name": term.adGroupName,
    "Match Type": term.matchType,
    "Targeting": term.targeting,
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
    "Ad Group ID": term.adGroupId,
    "Ad Group Name": term.adGroupName,
    "Match Type": term.matchType,
    "Targeting": term.targeting,
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

export async function readAmazonAdsActionDecisions(filePath: string) {
  if (!isAbsolute(filePath)) throw new ShopWeaverError("AMAZON_ADS_REVIEW_PATH_INVALID", "Amazon Ads reviewed workbook path must be absolute.");
  const workbook = XLSX.read(await readFile(filePath));
  const sheet = workbook.Sheets["Action Plan"];
  if (!sheet) throw new ShopWeaverError("AMAZON_ADS_ACTION_PLAN_MISSING", "Amazon Ads reviewed workbook must include an Action Plan sheet.");
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Array<Record<string, unknown>>;
  const reviewedRows = rows
    .map(reviewedDecision)
    .filter(row => row.decision);
  const decisions = reviewedRows.filter(row => ["approve", "reject", "defer"].includes(row.decision));
  const invalidDecisions = reviewedRows
    .filter(row => !["approve", "reject", "defer"].includes(row.decision))
    .map(row => ({
      actionId: row.actionId,
      action: row.action,
      decision: row.decision,
      reviewNotes: row.reviewNotes,
      error: "Decision must be approve, reject, or defer."
    }));
  const invalidActions = decisions
    .map(invalidApprovedAction)
    .filter(action => action !== undefined);
  const validDecisions = decisions.filter(row => !invalidActions.some(action => action.actionId === row.actionId));
  return {
    operation: "read_amazon_ads_action_decisions" as const,
    reviewedActionCount: validDecisions.length,
    invalidDecisionCount: invalidDecisions.length,
    invalidActionCount: invalidActions.length,
    decisions: validDecisions,
    invalidDecisions,
    invalidActions
  };
}

export async function previewAmazonAdsApprovedActions(filePath: string) {
  const review = await readAmazonAdsActionDecisions(filePath);
  const actions = review.decisions
    .filter(row => row.decision === "approve")
    .map(approvedActionPreview)
    .filter(action => action !== undefined);
  return {
    operation: "preview_amazon_ads_approved_actions" as const,
    approvedActionCount: actions.length,
    applied: false,
    warning: "Preview only. No campaigns, ad groups, bids, budgets, keywords, negatives, or ads were changed.",
    actions,
    invalidDecisionCount: review.invalidDecisionCount,
    invalidActionCount: review.invalidActionCount,
    invalidDecisions: review.invalidDecisions,
    invalidActions: review.invalidActions
  };
}

function approvedActionPreview(row: ReturnType<typeof reviewedDecision>) {
  if (row.action === "negative_exact_candidate") {
    return {
      actionId: row.actionId,
      operation: "create_sp_negative_keyword" as const,
      campaignId: row.campaignId,
      adGroupId: row.adGroupId,
      keywordText: row.searchTerm,
      matchType: "NEGATIVE_EXACT" as const,
      state: "ENABLED" as const,
      applied: false
    };
  }
  if (row.action === "exact_match_or_bid_review") {
    return {
      actionId: row.actionId,
      operation: "review_sp_exact_keyword_or_bid" as const,
      campaignId: row.campaignId,
      adGroupId: row.adGroupId,
      keywordText: row.searchTerm,
      matchType: "EXACT" as const,
      applied: false
    };
  }
  if (row.action === "budget_watch") {
    return {
      actionId: row.actionId,
      operation: "review_sp_campaign_budget" as const,
      campaignId: row.campaignId,
      applied: false
    };
  }
  return undefined;
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

function campaignMetrics(analysis: AmazonSearchTermReportAnalysis, campaignId: string) {
  const terms = [...analysis.wasteSearchTerms, ...analysis.efficientSearchTerms].filter(term => term.campaignId === campaignId);
  const spend = Number(terms.reduce((sum, term) => sum + term.spend, 0).toFixed(2));
  const sales = Number(terms.reduce((sum, term) => sum + term.sales, 0).toFixed(2));
  return {
    clicks: terms.reduce((sum, term) => sum + term.clicks, 0),
    spend,
    sales,
    orders: terms.reduce((sum, term) => sum + term.orders, 0),
    acos: sales > 0 ? Number(((spend / sales) * 100).toFixed(2)) : 0
  };
}

function actionId(action: string, scope: string, campaignId: string, adGroupId = "", searchTerm = ""): string {
  return [action, scope, slug(campaignId), slug(adGroupId), slug(searchTerm)].filter(Boolean).join(":");
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function reviewedDecision(row: Record<string, unknown>) {
  return {
    actionId: text(row["Action ID"]),
    action: text(row.Action),
    scope: text(row.Scope),
    campaignId: text(row["Campaign ID"]),
    adGroupId: text(row["Ad Group ID"]),
    searchTerm: text(row["Search Term"]),
    decision: text(row.Decision).toLowerCase(),
    reviewedBy: text(row["Reviewed By"]),
    reviewNotes: text(row["Review Notes"])
  };
}

function invalidApprovedAction(row: ReturnType<typeof reviewedDecision>) {
  if (row.decision !== "approve") return undefined;
  if ((row.action === "negative_exact_candidate" || row.action === "exact_match_or_bid_review") && (!row.campaignId || !row.adGroupId || !row.searchTerm)) {
    return {
      actionId: row.actionId,
      action: row.action,
      decision: row.decision,
      reviewNotes: row.reviewNotes,
      error: "Approved ad group actions require Campaign ID, Ad Group ID, and Search Term."
    };
  }
  if (row.action === "budget_watch" && !row.campaignId) {
    return {
      actionId: row.actionId,
      action: row.action,
      decision: row.decision,
      reviewNotes: row.reviewNotes,
      error: "Approved campaign actions require Campaign ID."
    };
  }
  return undefined;
}
