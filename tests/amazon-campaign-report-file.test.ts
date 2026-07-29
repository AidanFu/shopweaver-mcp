import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeAmazonSearchTermReportFile, readAmazonAdsActionDecisions, writeAmazonSearchTermOptimizationWorkbook } from "../src/amazon/campaign-report-file.js";

describe("analyzeAmazonSearchTermReportFile", () => {
  it("optimizes a Seller Central exported CSV search-term report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-"));
    const file = join(dir, "search-terms.csv");
    await writeFile(file, [
      "Campaign Name,Campaign ID,Ad Group Name,Ad Group ID,Match Type,Targeting,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
      "Auto Discovery,campaign-1,Discovery Ad Group,adgroup-1,BROAD,towel warmer,free towel warmer manual,18,$16.25,$0.00,0",
      "Manual Exact,campaign-2,Exact Winners,adgroup-2,EXACT,electric towel warmer gold,electric towel warmer gold,22,$12.00,$89.99,2"
    ].join("\n"));

    await expect(analyzeAmazonSearchTermReportFile(file)).resolves.toMatchObject({
      rowCount: 2,
      totalSpend: 28.25,
      wasteSearchTerms: [{ adGroupId: "adgroup-1", adGroupName: "Discovery Ad Group", matchType: "BROAD", targeting: "towel warmer", searchTerm: "free towel warmer manual", spend: 16.25 }],
      efficientSearchTerms: [{ adGroupId: "adgroup-2", adGroupName: "Exact Winners", matchType: "EXACT", targeting: "electric towel warmer gold", searchTerm: "electric towel warmer gold", orders: 2 }]
    });
  });

  it("writes an actionable optimization workbook from an exported search-term report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-"));
    const report = join(dir, "search-terms.csv");
    const output = join(dir, "optimization.xlsx");
    await writeFile(report, [
      "Campaign Name,Campaign ID,Ad Group Name,Ad Group ID,Match Type,Targeting,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
      "Auto Discovery,campaign-1,Discovery Ad Group,adgroup-1,BROAD,towel warmer,free towel warmer manual,31,$26.25,$0.00,0",
      "Manual Exact,campaign-2,Exact Winners,adgroup-2,EXACT,electric towel warmer gold,electric towel warmer gold,22,$12.00,$89.99,2"
    ].join("\n"));

    await expect(writeAmazonSearchTermOptimizationWorkbook(report, output)).resolves.toMatchObject({
      operation: "write_amazon_ads_search_term_optimization_workbook",
      outputPath: output,
      rowCount: 2,
      wasteSearchTermCount: 1,
      efficientSearchTermCount: 1
    });
    const workbook = XLSX.readFile(output);
    expect(workbook.SheetNames).toEqual(["Summary", "Action Plan", "Decision Options", "Waste Search Terms", "Efficient Search Terms", "Campaign Recommendations"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Action Plan"])).toEqual([
      {
        "Action ID": "negative_exact_candidate:ad_group:campaign-1:adgroup-1:free-towel-warmer-manual",
        "Priority": "high",
        "Action": "negative_exact_candidate",
        "Scope": "ad_group",
        "Proposed Change": "Add search term as ad group negative exact after review.",
        "Campaign ID": "campaign-1",
        "Campaign Name": "Auto Discovery",
        "Ad Group ID": "adgroup-1",
        "Ad Group Name": "Discovery Ad Group",
        "Match Type": "BROAD",
        "Targeting": "towel warmer",
        "Search Term": "free towel warmer manual",
        "Clicks": 31,
        "Spend": 26.25,
        "Sales": 0,
        "Orders": 0,
        "ACOS": "",
        "Reason": "High spend/clicks with no orders.",
        "Approval Required": true,
        "Decision": "",
        "Reviewed By": "",
        "Review Notes": ""
      },
      {
        "Action ID": "budget_watch:campaign:campaign-1",
        "Priority": "high",
        "Action": "budget_watch",
        "Scope": "campaign",
        "Proposed Change": "Review reducing or capping campaign budget until waste terms are handled.",
        "Campaign ID": "campaign-1",
        "Campaign Name": "Auto Discovery",
        "Ad Group ID": "",
        "Ad Group Name": "",
        "Match Type": "",
        "Targeting": "",
        "Search Term": "",
        "Clicks": 31,
        "Spend": 26.25,
        "Sales": 0,
        "Orders": 0,
        "ACOS": "",
        "Reason": "High campaign spend/clicks with no orders.",
        "Approval Required": true,
        "Decision": "",
        "Reviewed By": "",
        "Review Notes": ""
      },
      {
        "Action ID": "exact_match_or_bid_review:ad_group:campaign-2:adgroup-2:electric-towel-warmer-gold",
        "Priority": "normal",
        "Action": "exact_match_or_bid_review",
        "Scope": "ad_group",
        "Proposed Change": "Review search term for exact keyword promotion or modest bid increase.",
        "Campaign ID": "campaign-2",
        "Campaign Name": "Manual Exact",
        "Ad Group ID": "adgroup-2",
        "Ad Group Name": "Exact Winners",
        "Match Type": "EXACT",
        "Targeting": "electric towel warmer gold",
        "Search Term": "electric towel warmer gold",
        "Clicks": 22,
        "Spend": 12,
        "Sales": 89.99,
        "Orders": 2,
        "ACOS": 13.33,
        "Reason": "Orders with ACOS at or below 35%.",
        "Approval Required": true,
        "Decision": "",
        "Reviewed By": "",
        "Review Notes": ""
      }
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Waste Search Terms"])[0]).toMatchObject({
      "Ad Group ID": "adgroup-1",
      "Ad Group Name": "Discovery Ad Group",
      "Match Type": "BROAD",
      "Targeting": "towel warmer",
      "Search Term": "free towel warmer manual",
      "Recommendation": "Add as negative exact candidate after review; high spend/clicks with no orders."
    });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Decision Options"])).toEqual([
      { "Decision": "approve", "Meaning": "Approved for a future Amazon Ads write after a final confirmation gate." },
      { "Decision": "reject", "Meaning": "Do not apply this recommendation." },
      { "Decision": "defer", "Meaning": "Review again after more campaign data is available." }
    ]);
  });

  it("reads reviewed Ads action decisions from the action plan sheet", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-"));
    const file = join(dir, "reviewed-optimization.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      {
        "Action ID": "negative_exact_candidate:ad_group:campaign-1:adgroup-1:free-towel-warmer-manual",
        "Action": "negative_exact_candidate",
        "Scope": "ad_group",
        "Campaign ID": "campaign-1",
        "Ad Group ID": "adgroup-1",
        "Search Term": "free towel warmer manual",
        "Decision": "Approve",
        "Reviewed By": "Aidan",
        "Review Notes": "Waste term"
      },
      {
        "Action ID": "budget_watch:campaign:campaign-1",
        "Action": "budget_watch",
        "Scope": "campaign",
        "Campaign ID": "campaign-1",
        "Decision": "defer",
        "Reviewed By": "Aidan",
        "Review Notes": "Wait for next week"
      },
      {
        "Action ID": "exact_match_or_bid_review:ad_group:campaign-2:adgroup-2:electric-towel-warmer-gold",
        "Action": "exact_match_or_bid_review",
        "Decision": ""
      }
    ]), "Action Plan");
    XLSX.writeFile(workbook, file);

    await expect(readAmazonAdsActionDecisions(file)).resolves.toEqual({
      operation: "read_amazon_ads_action_decisions",
      reviewedActionCount: 2,
      decisions: [
        {
          actionId: "negative_exact_candidate:ad_group:campaign-1:adgroup-1:free-towel-warmer-manual",
          action: "negative_exact_candidate",
          scope: "ad_group",
          campaignId: "campaign-1",
          adGroupId: "adgroup-1",
          searchTerm: "free towel warmer manual",
          decision: "approve",
          reviewedBy: "Aidan",
          reviewNotes: "Waste term"
        },
        {
          actionId: "budget_watch:campaign:campaign-1",
          action: "budget_watch",
          scope: "campaign",
          campaignId: "campaign-1",
          adGroupId: "",
          searchTerm: "",
          decision: "defer",
          reviewedBy: "Aidan",
          reviewNotes: "Wait for next week"
        }
      ]
    });
  });
});
