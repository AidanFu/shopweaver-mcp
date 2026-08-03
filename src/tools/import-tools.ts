import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildAmazonListingRows } from "../import/amazon-listing.js";
import type { DriveImportService } from "../import/drive-import.js";
import { EnrichedDraftRowSchema, validateEnrichedDraftRow } from "../import/enriched.js";
import { buildEtsyVariationDraftPreview } from "../import/etsy-variation-draft.js";
import { inferEtsyVariationGroups, toEtsyVariationWorkbookRows } from "../import/etsy-variations.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export function previewDraftInputFromEnrichedRow(rowInput: unknown) {
  const row = EnrichedDraftRowSchema.parse(rowInput);
  const validationErrors = validateEnrichedDraftRow(row);
  if (validationErrors.length > 0) return { validationErrors, draftInput: null };
  return {
    validationErrors,
    draftInput: {
      title: row.englishTitle,
      description: row.englishDescription,
      quantity: row.quantity,
      price: row.price,
      taxonomyId: row.taxonomyId,
      whoMade: row.whoMade,
      whenMade: row.whenMade,
      type: "physical",
      tags: row.tags?.split(",").map(tag => tag.trim()).filter(Boolean),
      materials: row.materials?.split(",").map(material => material.trim()).filter(Boolean),
      readinessStateId: row.readinessStateId
    }
  };
}

export function previewAmazonListingWorkbookWrite(folderId: string, rowCount: number) {
  return {
    operation: "write_amazon_listing_workbook" as const,
    folderId,
    rowCount,
    filename: "Product Information - Amazon Listing.xlsx",
    warning: "This writes an Amazon planning workbook only. It does not call Amazon APIs, submit listings, upload images, create A+ Content, or change ads."
  };
}

export function previewAmazonOptimizationRefresh(folderId: string) {
  return {
    operation: "refresh_amazon_optimization_recommendations" as const,
    folderId,
    filename: "Product Information - Amazon Listing.xlsx",
    warning: "This refreshes the workbook Optimization Recommendations sheet only. It does not call Amazon APIs or change listings, categories, bids, budgets, keywords, or ads."
  };
}

export async function previewEtsyVariationGroups(imports: DriveImportService, folderId: string) {
  const imported = await imports.importFolder(folderId);
  const groups = inferEtsyVariationGroups(imported.products);
  return {
    operation: "preview_etsy_variation_groups" as const,
    folderId,
    groupCount: groups.length,
    rowCount: groups.reduce((count, group) => count + group.variants.length, 0),
    groups,
    warning: "This is read-only. Review grouping before creating any Etsy draft."
  };
}

export async function writeEtsyVariationWorkbook(imports: DriveImportService, folderId: string) {
  const imported = await imports.importFolder(folderId);
  const rows = toEtsyVariationWorkbookRows(inferEtsyVariationGroups(imported.products));
  const file = await imports.writeEnrichedWorkbook(folderId, rows);
  return {
    operation: "write_etsy_variation_workbook" as const,
    folderId,
    rowCount: rows.length,
    file,
    warning: "This wrote Product Information - Etsy Draft.xlsx to Google Drive only. It did not call Etsy."
  };
}

export function previewEtsyVariationDraftFromRows(rows: z.input<typeof EnrichedDraftRowSchema>[], listingGroup: string, variation1PropertyId: number) {
  const parsed = rows.map(row => EnrichedDraftRowSchema.parse(row));
  return buildEtsyVariationDraftPreview(parsed, listingGroup, { propertyId: variation1PropertyId });
}

export function registerImportTools(server: McpServer, imports: DriveImportService): void {
  server.registerTool("shopweaver_import_drive_folder", {
    description: "Import Product Information.xlsx and matched product images from one explicitly allowed Google Drive folder.",
    inputSchema: { folderId: z.string().min(1) }
  }, async ({ folderId }) => result(await imports.importFolder(folderId)));

  server.registerTool("shopweaver_write_enriched_workbook", {
    description: "Create or update Product Information - Etsy Draft.xlsx in an allowed Google Drive folder after explicit confirmation.",
    inputSchema: {
      mode: z.enum(["preview", "confirm"]).default("preview"),
      folderId: z.string().min(1),
      rows: z.array(z.record(z.string(), z.unknown())).min(1)
    }
  }, async ({ mode, folderId, rows }) => {
    if (mode === "preview") return result({ operation: "write_enriched_workbook", folderId, rowCount: rows.length, warning: "This will write Product Information - Etsy Draft.xlsx to Google Drive only after confirm mode." });
    return result(await imports.writeEnrichedWorkbook(folderId, rows as never));
  });

  server.registerTool("shopweaver_preview_etsy_variation_groups", {
    description: "Preview inferred Etsy variation groups from one explicitly allowed Google Drive folder. This is read-only.",
    inputSchema: { folderId: z.string().min(1) }
  }, async ({ folderId }) => result(await previewEtsyVariationGroups(imports, folderId)));

  server.registerTool("shopweaver_write_etsy_variation_workbook", {
    description: "Preview or confirm writing Product Information - Etsy Draft.xlsx with Etsy variation columns. This writes to Google Drive only and does not call Etsy.",
    inputSchema: {
      mode: z.enum(["preview", "confirm"]).default("preview"),
      folderId: z.string().min(1)
    }
  }, async ({ mode, folderId }) => result(mode === "preview"
    ? { operation: "write_etsy_variation_workbook", folderId, warning: "This will write Product Information - Etsy Draft.xlsx to Google Drive only in confirm mode." }
    : await writeEtsyVariationWorkbook(imports, folderId)));

  server.registerTool("shopweaver_preview_etsy_variation_draft", {
    description: "Preview one Etsy grouped draft payload, image plan, and inventory payload from reviewed Etsy Draft workbook rows. This is read-only.",
    inputSchema: {
      listingGroup: z.string().min(1),
      variation1PropertyId: z.number().int().positive(),
      rows: z.array(EnrichedDraftRowSchema).min(1)
    }
  }, async ({ rows, listingGroup, variation1PropertyId }) => result(previewEtsyVariationDraftFromRows(rows, listingGroup, variation1PropertyId)));

  server.registerTool("shopweaver_write_amazon_listing_workbook", {
    description: "Create or update Product Information - Amazon Listing.xlsx in an allowed Google Drive folder. This is a workbook-only planning step and does not call Amazon APIs.",
    inputSchema: {
      mode: z.enum(["preview", "confirm"]).default("preview"),
      folderId: z.string().min(1)
    }
  }, async ({ mode, folderId }) => {
    const imported = await imports.importFolder(folderId);
    if (mode === "preview") return result(previewAmazonListingWorkbookWrite(folderId, imported.products.length));
    const rows = buildAmazonListingRows(imported.products);
    const written = await imports.writeAmazonListingWorkbook(folderId, rows);
    return result({
      operation: "write_amazon_listing_workbook",
      folderId,
      rowCount: rows.length,
      filename: "Product Information - Amazon Listing.xlsx",
      file: written,
      warning: "Workbook written only. No Amazon API, image, A+ Content, advertising, order, shipment, refund, or buyer-data action was performed."
    });
  });

  server.registerTool("shopweaver_refresh_amazon_optimization_recommendations", {
    description: "Refresh the Optimization Recommendations sheet in Product Information - Amazon Listing.xlsx from pasted daily/weekly workbook metrics. This is workbook-only and does not call Amazon APIs.",
    inputSchema: {
      mode: z.enum(["preview", "confirm"]).default("preview"),
      folderId: z.string().min(1)
    }
  }, async ({ mode, folderId }) => {
    if (mode === "preview") return result(previewAmazonOptimizationRefresh(folderId));
    const refreshed = await imports.refreshAmazonOptimizationRecommendations(folderId);
    return result({
      operation: "refresh_amazon_optimization_recommendations",
      folderId,
      filename: "Product Information - Amazon Listing.xlsx",
      ...refreshed,
      warning: "Workbook recommendations refreshed only. No Amazon API, listing, category, bid, budget, keyword, advertising, order, shipment, refund, or buyer-data action was performed."
    });
  });

  server.registerTool("shopweaver_preview_etsy_draft_from_enriched_row", {
    description: "Validate one enriched workbook row and produce an Etsy draft payload preview without writing to Etsy.",
    inputSchema: { row: z.record(z.string(), z.unknown()) }
  }, async ({ row }) => result(previewDraftInputFromEnrichedRow(row)));
}
