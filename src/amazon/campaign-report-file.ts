import { extname, isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { ShopWeaverError } from "../errors.js";
import { analyzeAmazonSearchTermReportRows } from "./campaign-optimization.js";

export async function analyzeAmazonSearchTermReportFile(filePath: string) {
  return analyzeAmazonSearchTermReportRows(await readAmazonSearchTermReportRows(filePath));
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
