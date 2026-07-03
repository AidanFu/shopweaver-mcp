import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ServerDependencies {}

export function createServer(_dependencies: ServerDependencies): McpServer {
  return new McpServer({ name: "shopweaver-mcp", version: "0.1.0" });
}
