import { randomBytes } from "node:crypto";
import { ShopWeaverError } from "../errors.js";
import { canonicalHash } from "./canonical.js";

export type WriteAction =
  | "create_draft"
  | "update_draft"
  | "upload_draft_image"
  | "upload_drive_images"
  | "update_draft_inventory"
  | "amazon_update_listing_copy"
  | "amazon_ads_create_campaigns"
  | "amazon_ads_create_negative_keywords"
  | "amazon_ads_update_ad_group_bids"
  | "amazon_ads_update_campaign_bidding"
  | "amazon_ads_update_campaign_budgets"
  | "amazon_ads_update_campaign_states"
  | "amazon_ads_update_keyword_bids";

type PreviewRecord = {
  action: WriteAction;
  shopId: number;
  listingId?: number;
  payloadHash: string;
  expiresAt: number;
};

export class ConfirmationStore {
  readonly #records = new Map<string, PreviewRecord>();

  constructor(private readonly now: () => number = Date.now) {}

  issue(action: WriteAction, shopId: number, payload: unknown, listingId?: number) {
    const confirmationToken = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + 600_000;
    this.#records.set(confirmationToken, { action, shopId, listingId, payloadHash: canonicalHash(payload), expiresAt });
    return { confirmationToken, expiresAt };
  }

  consume(token: string, action: WriteAction, shopId: number, payload: unknown, listingId?: number): void {
    const record = this.#records.get(token);
    this.#records.delete(token);
    if (!record) throw new ShopWeaverError("CONFIRMATION_REQUIRED", "A valid write preview is required.");
    if (record.expiresAt < this.now()) throw new ShopWeaverError("CONFIRMATION_EXPIRED", "The write preview expired; preview the operation again.");
    if (record.action !== action || record.shopId !== shopId || record.listingId !== listingId || record.payloadHash !== canonicalHash(payload)) {
      throw new ShopWeaverError("PREVIEW_MISMATCH", "The confirmed request does not exactly match its preview.");
    }
  }
}
