import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { EtsyClient } from "./etsy/client.js";
import { ListingService } from "./etsy/listings.js";
import { OrderService } from "./etsy/orders.js";
import { createServer } from "./server.js";
import { DraftWriteService } from "./tools/write-tools.js";
import { ConfirmationStore } from "./writes/confirmations.js";

const store = new KeychainCredentialStore();
const client = new EtsyClient({ store });
const listings = new ListingService(client, store);
const orders = new OrderService(client, store);
const writes = new DraftWriteService(client, listings, store, new ConfirmationStore());
const server = createServer({ store, listings, orders, writes });
await server.connect(new StdioServerTransport());
