import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DriveImportService } from "../import/drive-import.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
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
}
