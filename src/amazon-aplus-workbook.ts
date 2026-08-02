#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { writeAmazonAplusOptimizationWorkbook, type AmazonAplusWorkbookInput } from "./amazon/aplus-workbook.js";
import { ShopWeaverError } from "./errors.js";

interface AmazonAplusWorkbookArgs {
  inputPath: string;
  outputPath: string;
  outputFormat: "json" | "summary";
}

export function parseAmazonAplusWorkbookArgs(args: string[]): AmazonAplusWorkbookArgs {
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
  return parsed as AmazonAplusWorkbookArgs;
}

export async function buildAmazonAplusWorkbookFromFile(args: AmazonAplusWorkbookArgs) {
  const input = JSON.parse(await readFile(args.inputPath, "utf8")) as Pick<AmazonAplusWorkbookInput, "items">;
  return writeAmazonAplusOptimizationWorkbook({
    outputPath: args.outputPath,
    items: input.items
  });
}

export function renderAmazonAplusWorkbookSummary(result: Record<string, any>): string {
  return [
    "Amazon A+ Optimization Workbook",
    `ASINs: ${result.asinCount ?? 0}`,
    `Output: ${result.outputPath ?? ""}`,
    "Amazon write status: none"
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseAmazonAplusWorkbookArgs(process.argv.slice(2));
  const result = await buildAmazonAplusWorkbookFromFile(args);
  stdout.write(`${args.outputFormat === "summary" ? renderAmazonAplusWorkbookSummary(result) : JSON.stringify(result, null, 2)}\n`);
}

function outputFormat(value: string | undefined): AmazonAplusWorkbookArgs["outputFormat"] {
  if (!value) return "json";
  if (value === "json" || value === "summary") return value;
  throw usageError();
}

function usageError() {
  return new ShopWeaverError("AMAZON_APLUS_WORKBOOK_ARGS_INVALID", "Usage: npm run amazon:aplus:workbook -- --input /path/aplus-input.json --output /path/aplus-optimization.xlsx [--format json|summary]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof ShopWeaverError ? error.message : "ShopWeaver Amazon A+ workbook generation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
