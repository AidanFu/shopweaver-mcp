import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CredentialStore } from "../credentials/types.js";
import type { ListingService } from "../etsy/listings.js";
import type { OrderService } from "../etsy/orders.js";
import { ListingStateSchema } from "../etsy/schemas.js";

export async function connectionStatus(store: CredentialStore) {
  const [app, oauth, shop] = await Promise.all([store.get("app"), store.get("oauth"), store.get("shop")]);
  return {
    credentialsAvailable: app !== null,
    authorized: oauth !== null,
    shopConnected: shop !== null,
    scopes: oauth?.scopes ?? []
  };
}

function result(value: unknown) {
  const structuredContent = value as Record<string, unknown>;
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent };
}

export function registerReadTools(server: McpServer, store: CredentialStore, listings: ListingService, orders?: OrderService): void {
  server.registerTool("etsy_connection_status", {
    description: "Report whether ShopWeaver has credentials, authorization, and one connected Etsy shop without revealing secrets.",
    inputSchema: {}
  }, async () => result(await connectionStatus(store)));

  server.registerTool("etsy_get_shop", {
    description: "Get basic information for the one connected Etsy shop.",
    inputSchema: {}
  }, async () => result(await listings.getShop()));

  server.registerTool("etsy_list_listings", {
    description: "List listings belonging to the one connected Etsy shop.",
    inputSchema: {
      state: ListingStateSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().nonnegative().optional()
    }
  }, async input => result(await listings.listListings(input)));

  server.registerTool("etsy_get_listing", {
    description: "Get operational details for one listing in the connected Etsy shop.",
    inputSchema: { listingId: z.number().int().positive() }
  }, async ({ listingId }) => result(await listings.getListing(listingId)));

  if (orders) server.registerTool("etsy_list_order_summaries", {
    description: "List minimized order summaries for the connected Etsy shop without buyer contact, address, payment, or message data.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().nonnegative().optional(),
      minCreated: z.number().int().nonnegative().optional(),
      maxCreated: z.number().int().nonnegative().optional()
    }
  }, async input => result(await orders.listSummaries(input)));
}
