#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { writeAmazonBrandStoreWorkbook, type AmazonBrandStoreInput } from "./amazon/brand-store.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonBrandStoreArgs {
  inputPath: string;
  outputPath: string;
  outputFormat: "json" | "summary";
}

export function parseAmazonBrandStoreArgs(args: string[]): AmazonBrandStoreArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw usageError();
    values.set(key, value);
  }
  const parsed = {
    inputPath: values.get("--input"),
    outputPath: values.get("--output"),
    outputFormat: outputFormat(values.get("--format"))
  };
  if (!parsed.inputPath || !parsed.outputPath) throw usageError();
  return parsed as AmazonBrandStoreArgs;
}

export async function buildAmazonBrandStoreWorkbookFromFile(args: AmazonBrandStoreArgs) {
  const input = JSON.parse(await readFile(args.inputPath, "utf8")) as AmazonBrandStoreInput;
  return writeAmazonBrandStoreWorkbook({
    ...input,
    outputPath: args.outputPath
  });
}

export function renderAmazonBrandStoreSummary(result: Record<string, any>): string {
  return [
    "Amazon Brand Store Workbook",
    `Products: ${result.productCount ?? 0}`,
    `Output: ${result.outputPath ?? ""}`,
    "Amazon write status: none"
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseAmazonBrandStoreArgs(process.argv.slice(2));
  const result = await buildAmazonBrandStoreWorkbookFromFile(args);
  stdout.write(`${args.outputFormat === "summary" ? renderAmazonBrandStoreSummary(result) : JSON.stringify(result, null, 2)}\n`);
}

function outputFormat(value: string | undefined): AmazonBrandStoreArgs["outputFormat"] {
  if (!value) return "json";
  if (value === "json" || value === "summary") return value;
  throw usageError();
}

function usageError() {
  return new ShopWeaverError("AMAZON_BRAND_STORE_ARGS_INVALID", "Usage: npm run amazon:brand-store:workbook -- --input /path/brand-store-input.json --output /path/brand-store.xlsx [--format json|summary]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon Brand Store workbook generation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
