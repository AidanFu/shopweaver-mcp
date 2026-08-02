import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CredentialStore } from "../credentials/types.js";
import type { GoogleDriveService } from "../google/drive.js";
import type { GoogleDriveHealthService } from "../google/status.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export async function googleConnectionStatus(
  store: CredentialStore,
  health?: Pick<GoogleDriveHealthService, "status">,
  options: { validateRefresh?: boolean } = {}
) {
  if (health) return health.status(options);
  const [app, google] = await Promise.all([store.get("googleApp"), store.get("google")]);
  return {
    credentialsAvailable: app !== null,
    authorized: google !== null,
    scopes: google?.scopes ?? []
  };
}

export class GoogleFolderToolService {
  constructor(private readonly drive: GoogleDriveService) {}

  async addAllowedFolder(folderUrlOrId: string) {
    return this.drive.addAllowedFolder(folderUrlOrId);
  }

  async listAllowedFolders() {
    return this.drive.listAllowedFolders();
  }

  async removeAllowedFolder(folderId: string) {
    await this.drive.removeAllowedFolder(folderId);
    return { removed: true };
  }
}

export function registerGoogleTools(
  server: McpServer,
  store: CredentialStore,
  folders: GoogleFolderToolService,
  health?: Pick<GoogleDriveHealthService, "status">
): void {
  server.registerTool("google_drive_connection_status", {
    description: "Report whether Google Drive credentials are available without revealing tokens.",
    inputSchema: { validateRefresh: z.boolean().default(false) }
  }, async ({ validateRefresh }) => result(await googleConnectionStatus(store, health, { validateRefresh })));

  server.registerTool("google_drive_add_allowed_folder", {
    description: "Validate and add one Google Drive folder by URL or ID to the allowed-folder list.",
    inputSchema: { folderUrlOrId: z.string().min(1) }
  }, async ({ folderUrlOrId }) => result(await folders.addAllowedFolder(folderUrlOrId)));

  server.registerTool("google_drive_list_allowed_folders", {
    description: "List Google Drive folders explicitly allowed for ShopWeaver imports.",
    inputSchema: {}
  }, async () => result(await folders.listAllowedFolders()));

  server.registerTool("google_drive_remove_allowed_folder", {
    description: "Remove one Google Drive folder from the allowed-folder list.",
    inputSchema: { folderId: z.string().min(1) }
  }, async ({ folderId }) => result(await folders.removeAllowedFolder(folderId)));
}
