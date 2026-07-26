import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DriveImageUploadService } from "../import/drive-image-upload.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

const DriveImageUploadInput = {
  mode: z.enum(["preview", "confirm"]).default("preview"),
  confirmationToken: z.string().min(20).optional(),
  listingId: z.number().int().positive(),
  folderId: z.string().min(1),
  productName: z.string().min(1),
  maxImages: z.number().int().positive().max(10).optional()
};

export function registerDriveImageTools(server: McpServer, uploads: DriveImageUploadService): void {
  server.registerTool("shopweaver_upload_drive_images_to_etsy_draft", {
    description: "Preview or confirm uploading matched Google Drive product images to one Etsy draft listing.",
    inputSchema: DriveImageUploadInput
  }, async ({ mode, confirmationToken, ...input }) => result(mode === "preview"
    ? await uploads.previewUpload(input)
    : await uploads.confirmUpload(input, confirmationToken ?? "")));
}
