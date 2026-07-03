import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { ListingService } from "../src/etsy/listings.js";
import { OrderService } from "../src/etsy/orders.js";
import { createServer } from "../src/server.js";
import { DraftWriteService } from "../src/tools/write-tools.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";

describe("MCP integration", () => {
  it("exposes exactly the approved nine tools", async () => {
    const store = new MemoryCredentialStore();
    await store.set("shop", { userId: 1, shopId: 42 });
    const clientApi = { request: vi.fn() } as never;
    const listings = new ListingService(clientApi, store);
    const orders = new OrderService(clientApi, store);
    const writes = new DraftWriteService(clientApi, listings, store, new ConfirmationStore());
    const server = createServer({ store, listings, orders, writes });
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name).sort()).toEqual([
      "etsy_connection_status",
      "etsy_create_draft_listing",
      "etsy_get_listing",
      "etsy_get_shop",
      "etsy_list_listings",
      "etsy_list_order_summaries",
      "etsy_update_draft_inventory",
      "etsy_update_draft_listing",
      "etsy_upload_draft_image"
    ]);
    await Promise.all([client.close(), server.close()]);
  });
});
