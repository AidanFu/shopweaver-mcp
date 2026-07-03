import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import type { EtsyClient } from "../etsy/client.js";
import type { ListingService } from "../etsy/listings.js";
import { ListingSchema, publicMoney } from "../etsy/schemas.js";
import type { ConfirmationStore } from "../writes/confirmations.js";

const PriceSchema = z.string().regex(/^\d+(\.\d{1,2})?$/);
const WhoMadeSchema = z.enum(["i_did", "collective", "someone_else"]);
const TypeSchema = z.enum(["physical", "download"]);

const DraftCreateFields = {
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1),
  quantity: z.number().int().nonnegative(),
  price: PriceSchema,
  whoMade: WhoMadeSchema,
  whenMade: z.string().trim().min(1),
  taxonomyId: z.number().int().positive(),
  type: TypeSchema,
  tags: z.array(z.string().trim().min(1)).max(13).optional(),
  materials: z.array(z.string().trim().min(1)).optional(),
  readinessStateId: z.number().int().positive().optional()
};

const DraftUpdateFields = {
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().min(1).optional(),
  taxonomyId: z.number().int().positive().optional(),
  whoMade: WhoMadeSchema.optional(),
  whenMade: z.string().trim().min(1).optional(),
  type: TypeSchema.optional(),
  tags: z.array(z.string().trim().min(1)).max(13).optional(),
  materials: z.array(z.string().trim().min(1)).optional(),
  readinessStateId: z.number().int().positive().optional()
};

export type DraftCreateInput = z.infer<z.ZodObject<typeof DraftCreateFields>>;
export type DraftUpdateInput = z.infer<z.ZodObject<typeof DraftUpdateFields>>;

function encode(fields: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    body.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  }
  return body;
}

export class DraftWriteService {
  constructor(
    private readonly client: EtsyClient,
    private readonly listings: ListingService,
    private readonly store: CredentialStore,
    private readonly confirmations: ConfirmationStore
  ) {}

  private async shopId(): Promise<number> {
    const shop = await this.store.get("shop");
    if (!shop) throw new ShopWeaverError("SHOP_NOT_CONNECTED", "Connect one Etsy shop before using write tools.");
    return shop.shopId;
  }

  async previewCreate(input: DraftCreateInput) {
    const changes = z.object(DraftCreateFields).strict().parse(input);
    const shopId = await this.shopId();
    const confirmation = this.confirmations.issue("create_draft", shopId, changes);
    return { operation: "create_draft" as const, shopId, changes, ...confirmation, warning: "This will create a new Etsy draft. It will not publish the listing." };
  }

  async confirmCreate(input: DraftCreateInput, confirmationToken: string) {
    const changes = z.object(DraftCreateFields).strict().parse(input);
    const shopId = await this.shopId();
    this.confirmations.consume(confirmationToken, "create_draft", shopId, changes);
    const body = encode({
      title: changes.title,
      description: changes.description,
      quantity: changes.quantity,
      price: changes.price,
      who_made: changes.whoMade,
      when_made: changes.whenMade,
      taxonomy_id: changes.taxonomyId,
      type: changes.type,
      tags: changes.tags,
      materials: changes.materials,
      readiness_state_id: changes.readinessStateId
    });
    try {
      const listing = await this.client.request(`/application/shops/${shopId}/listings`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      }, ListingSchema);
      return { listingId: listing.listing_id, state: listing.state, title: listing.title, price: publicMoney(listing.price) };
    } catch (error) {
      throw new ShopWeaverError("CREATE_RESULT_UNCERTAIN", "Draft creation result is uncertain. Inspect existing Etsy drafts before trying again.", error);
    }
  }

  async previewUpdate(listingId: number, input: DraftUpdateInput) {
    const changes = z.object(DraftUpdateFields).strict().refine(value => Object.keys(value).length > 0).parse(input);
    const shopId = await this.shopId();
    if (await this.listings.getListingState(listingId) !== "draft") throw new ShopWeaverError("DRAFT_REQUIRED", "Only Etsy draft listings can be updated.");
    const confirmation = this.confirmations.issue("update_draft", shopId, changes, listingId);
    return { operation: "update_draft" as const, shopId, listingId, changes, ...confirmation, warning: "This will update an Etsy draft. It cannot publish the listing." };
  }

  async confirmUpdate(listingId: number, input: DraftUpdateInput, confirmationToken: string) {
    const changes = z.object(DraftUpdateFields).strict().refine(value => Object.keys(value).length > 0).parse(input);
    const shopId = await this.shopId();
    this.confirmations.consume(confirmationToken, "update_draft", shopId, changes, listingId);
    if (await this.listings.getListingState(listingId) !== "draft") throw new ShopWeaverError("DRAFT_REQUIRED", "Only Etsy draft listings can be updated.");
    const body = encode({
      title: changes.title,
      description: changes.description,
      taxonomy_id: changes.taxonomyId,
      who_made: changes.whoMade,
      when_made: changes.whenMade,
      type: changes.type,
      tags: changes.tags,
      materials: changes.materials,
      readiness_state_id: changes.readinessStateId
    });
    const listing = await this.client.request(`/application/listings/${listingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    }, ListingSchema);
    return { listingId: listing.listing_id, state: listing.state, title: listing.title };
  }
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export function registerWriteTools(server: McpServer, writes: DraftWriteService): void {
  server.registerTool("etsy_create_draft_listing", {
    description: "Preview or confirm creation of an Etsy draft listing. Preview is default; this tool cannot publish.",
    inputSchema: { mode: z.enum(["preview", "confirm"]).default("preview"), confirmationToken: z.string().min(20).optional(), ...DraftCreateFields }
  }, async ({ mode, confirmationToken, ...input }) => result(mode === "preview"
    ? await writes.previewCreate(input)
    : await writes.confirmCreate(input, confirmationToken ?? "")));

  server.registerTool("etsy_update_draft_listing", {
    description: "Preview or confirm supported field changes to an Etsy draft. Active listings are rejected.",
    inputSchema: { mode: z.enum(["preview", "confirm"]).default("preview"), confirmationToken: z.string().min(20).optional(), listingId: z.number().int().positive(), ...DraftUpdateFields }
  }, async ({ mode, confirmationToken, listingId, ...input }) => result(mode === "preview"
    ? await writes.previewUpdate(listingId, input)
    : await writes.confirmUpdate(listingId, input, confirmationToken ?? "")));
}
