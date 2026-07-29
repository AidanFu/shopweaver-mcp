import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeAmazonSearchTermReportFile, writeAmazonSearchTermOptimizationWorkbook } from "../src/amazon/campaign-report-file.js";

describe("analyzeAmazonSearchTermReportFile", () => {
  it("optimizes a Seller Central exported CSV search-term report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-"));
    const file = join(dir, "search-terms.csv");
    await writeFile(file, [
      "Campaign Name,Campaign ID,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
      "Auto Discovery,campaign-1,free towel warmer manual,18,$16.25,$0.00,0",
      "Manual Exact,campaign-2,electric towel warmer gold,22,$12.00,$89.99,2"
    ].join("\n"));

    await expect(analyzeAmazonSearchTermReportFile(file)).resolves.toMatchObject({
      rowCount: 2,
      totalSpend: 28.25,
      wasteSearchTerms: [{ searchTerm: "free towel warmer manual", spend: 16.25 }],
      efficientSearchTerms: [{ searchTerm: "electric towel warmer gold", orders: 2 }]
    });
  });

  it("writes an actionable optimization workbook from an exported search-term report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-amazon-ads-"));
    const report = join(dir, "search-terms.csv");
    const output = join(dir, "optimization.xlsx");
    await writeFile(report, [
      "Campaign Name,Campaign ID,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
      "Auto Discovery,campaign-1,free towel warmer manual,18,$16.25,$0.00,0",
      "Manual Exact,campaign-2,electric towel warmer gold,22,$12.00,$89.99,2"
    ].join("\n"));

    await expect(writeAmazonSearchTermOptimizationWorkbook(report, output)).resolves.toMatchObject({
      operation: "write_amazon_ads_search_term_optimization_workbook",
      outputPath: output,
      rowCount: 2,
      wasteSearchTermCount: 1,
      efficientSearchTermCount: 1
    });
    const workbook = XLSX.readFile(output);
    expect(workbook.SheetNames).toEqual(["Summary", "Waste Search Terms", "Efficient Search Terms", "Campaign Recommendations"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Waste Search Terms"])[0]).toMatchObject({
      "Search Term": "free towel warmer manual",
      "Recommendation": "Add as negative exact candidate after review; high spend/clicks with no orders."
    });
  });
});
