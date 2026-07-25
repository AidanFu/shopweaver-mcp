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
}
