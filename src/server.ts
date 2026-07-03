import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CredentialStore } from "./credentials/types.js";
import type { ListingService } from "./etsy/listings.js";
import { registerReadTools } from "./tools/read-tools.js";

export interface ServerDependencies {
  store?: CredentialStore;
  listings?: ListingService;
}

export function createServer(dependencies: ServerDependencies): McpServer {
  const server = new McpServer({ name: "shopweaver-mcp", version: "0.1.0" });
  if (dependencies.store && dependencies.listings) registerReadTools(server, dependencies.store, dependencies.listings);
  return server;
}
