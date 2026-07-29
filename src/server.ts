import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AmazonAdsClient } from "./amazon/ads-client.js";
import type { AmazonSpApiClient } from "./amazon/sp-api-client.js";
import type { CredentialStore } from "./credentials/types.js";
import type { ListingService } from "./etsy/listings.js";
import type { OrderService } from "./etsy/orders.js";
import type { DriveImageUploadService } from "./import/drive-image-upload.js";
import type { DriveImportService } from "./import/drive-import.js";
import { registerAmazonTools, type AmazonListingWriteService } from "./tools/amazon-tools.js";
import { registerDriveImageTools } from "./tools/drive-image-tools.js";
import { registerGoogleTools, type GoogleFolderToolService } from "./tools/google-tools.js";
import { registerImportTools } from "./tools/import-tools.js";
import { registerReadTools } from "./tools/read-tools.js";
import type { DraftWriteService } from "./tools/write-tools.js";
import { registerWriteTools } from "./tools/write-tools.js";

export interface ServerDependencies {
  store?: CredentialStore;
  listings?: ListingService;
  orders?: OrderService;
  writes?: DraftWriteService;
  googleFolders?: GoogleFolderToolService;
  driveImports?: DriveImportService;
  driveImageUploads?: DriveImageUploadService;
  amazonAds?: AmazonAdsClient;
  amazonSpApi?: AmazonSpApiClient;
  amazonListingWrites?: AmazonListingWriteService;
}

export function createServer(dependencies: ServerDependencies): McpServer {
  const server = new McpServer({ name: "shopweaver-mcp", version: "0.1.0" });
  if (dependencies.store && dependencies.listings) registerReadTools(server, dependencies.store, dependencies.listings, dependencies.orders);
  if (dependencies.writes) registerWriteTools(server, dependencies.writes);
  if (dependencies.store && dependencies.googleFolders) registerGoogleTools(server, dependencies.store, dependencies.googleFolders);
  if (dependencies.store && dependencies.amazonSpApi) registerAmazonTools(server, dependencies.store, dependencies.amazonSpApi, dependencies.amazonAds, dependencies.amazonListingWrites);
  if (dependencies.driveImports) registerImportTools(server, dependencies.driveImports);
  if (dependencies.driveImageUploads) registerDriveImageTools(server, dependencies.driveImageUploads);
  return server;
}
