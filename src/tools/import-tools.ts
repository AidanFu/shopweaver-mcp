import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DriveImportService } from "../import/drive-import.js";
import { EnrichedDraftRowSchema, validateEnrichedDraftRow } from "../import/enriched.js";

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

  server.registerTool("shopweaver_preview_etsy_draft_from_enriched_row", {
    description: "Validate one enriched workbook row and produce an Etsy draft payload preview without writing to Etsy.",
    inputSchema: { row: z.record(z.string(), z.unknown()) }
  }, async ({ row }) => result(previewDraftInputFromEnrichedRow(row)));
}
