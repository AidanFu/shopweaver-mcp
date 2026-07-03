import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { z } from "zod";
import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import type { EtsyClient } from "../etsy/client.js";
import type { ListingService } from "../etsy/listings.js";
import { ListingImageSchema, ListingSchema, publicMoney } from "../etsy/schemas.js";
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

async function inspectImage(imagePath: string) {
  if (!isAbsolute(imagePath)) throw new ShopWeaverError("IMAGE_PATH_INVALID", "Image path must be absolute.");
  const stat = await lstat(imagePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new ShopWeaverError("IMAGE_PATH_INVALID", "Image path must point to a regular file, not a symlink.");
  if (stat.size > 10 * 1024 * 1024) throw new ShopWeaverError("IMAGE_TOO_LARGE", "Image exceeds the 10 MB upload limit.");
  const bytes = await readFile(imagePath);
  let mediaType: string | null = null;
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) mediaType = "image/png";
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mediaType = "image/jpeg";
  else if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) mediaType = "image/gif";
  else if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") mediaType = "image/webp";
  if (!mediaType) throw new ShopWeaverError("IMAGE_TYPE_UNSUPPORTED", "Image must be PNG, JPEG, GIF, or WebP.");
  return { absolutePath: imagePath, filename: basename(imagePath), size: stat.size, mediaType, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
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

  async previewImage(listingId: number, imagePath: string, rank?: number) {
    const shopId = await this.shopId();
    if (await this.listings.getListingState(listingId) !== "draft") throw new ShopWeaverError("DRAFT_REQUIRED", "Images can be uploaded only to Etsy drafts.");
    const image = await inspectImage(imagePath);
    const payload = { imagePath: image.absolutePath, sha256: image.sha256, rank: rank ?? null };
    const confirmation = this.confirmations.issue("upload_draft_image", shopId, payload, listingId);
    return {
      operation: "upload_draft_image" as const,
      shopId,
      listingId,
      file: { filename: image.filename, size: image.size, mediaType: image.mediaType },
      rank: rank ?? null,
      ...confirmation,
      warning: "This will upload the local image only to the confirmed Etsy draft."
    };
  }

  async confirmImage(listingId: number, imagePath: string, rank: number | undefined, confirmationToken: string) {
    const shopId = await this.shopId();
    const image = await inspectImage(imagePath);
    const payload = { imagePath: image.absolutePath, sha256: image.sha256, rank: rank ?? null };
    this.confirmations.consume(confirmationToken, "upload_draft_image", shopId, payload, listingId);
    if (await this.listings.getListingState(listingId) !== "draft") throw new ShopWeaverError("DRAFT_REQUIRED", "Images can be uploaded only to Etsy drafts.");
    const form = new FormData();
    form.set("image", new Blob([image.bytes], { type: image.mediaType }), image.filename);
    if (rank !== undefined) form.set("rank", String(rank));
    const uploaded = await this.client.request(`/application/shops/${shopId}/listings/${listingId}/images`, { method: "POST", body: form }, ListingImageSchema);
    return {
      listingImageId: uploaded.listing_image_id,
      rank: uploaded.rank,
      width: uploaded.full_width,
      height: uploaded.full_height,
      url: uploaded.url_fullxfull ?? null
    };
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

  server.registerTool("etsy_upload_draft_image", {
    description: "Preview or confirm one local image upload to an Etsy draft. Active listings are rejected.",
    inputSchema: {
      mode: z.enum(["preview", "confirm"]).default("preview"),
      confirmationToken: z.string().min(20).optional(),
      listingId: z.number().int().positive(),
      imagePath: z.string().min(1),
      rank: z.number().int().min(1).max(10).optional()
    }
  }, async ({ mode, confirmationToken, listingId, imagePath, rank }) => result(mode === "preview"
    ? await writes.previewImage(listingId, imagePath, rank)
    : await writes.confirmImage(listingId, imagePath, rank, confirmationToken ?? "")));
}
