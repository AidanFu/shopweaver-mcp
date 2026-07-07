import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import type { EtsyClient } from "./client.js";
import { InventorySchema, ListingSchema, ListingStateSchema, PageSchema, ShopSchema, publicMoney } from "./schemas.js";
import type { z } from "zod";

export type ListingState = z.infer<typeof ListingStateSchema>;

export function publicInventory(inventory: z.infer<typeof InventorySchema>) {
  return {
    products: inventory.products.map(product => ({
      productId: product.product_id ?? null,
      sku: product.sku ?? "",
      propertyValues: product.property_values.map(property => ({
        propertyId: property.property_id,
        propertyName: property.property_name ?? "",
        scaleId: property.scale_id ?? null,
        scaleName: property.scale_name ?? null,
        valueIds: property.value_ids,
        values: property.values
      })),
      offerings: product.offerings.map(offering => ({
        offeringId: offering.offering_id ?? null,
        quantity: offering.quantity,
        enabled: offering.is_enabled,
        price: offering.price ? publicMoney(offering.price) : null,
        readinessStateId: offering.readiness_state_id ?? null
      }))
    }))
  };
}

export class ListingService {
  constructor(private readonly client: EtsyClient, private readonly store: CredentialStore) {}

  private async shopId(): Promise<number> {
    const shop = await this.store.get("shop");
    if (!shop) throw new ShopWeaverError("SHOP_NOT_CONNECTED", "Connect one Etsy shop before using this tool.");
    return shop.shopId;
  }

  private async getOwnedListing(listingId: number) {
    const [shopId, listing] = await Promise.all([
      this.shopId(),
      this.client.request(`/application/listings/${listingId}`, {}, ListingSchema)
    ]);
    if (listing.shop_id !== shopId) throw new ShopWeaverError("LISTING_NOT_IN_SHOP", "The listing does not belong to the connected Etsy shop.");
    return listing;
  }

  async getShop() {
    const shopId = await this.shopId();
    const shop = await this.client.request(`/application/shops/${shopId}`, {}, ShopSchema);
    return {
      shopId: shop.shop_id,
      name: shop.shop_name,
      title: shop.title ?? null,
      currency: shop.currency_code,
      activeListingCount: shop.active_listing_count
    };
  }

  async listListings(input: { state?: ListingState; limit?: number; offset?: number }) {
    const shopId = await this.shopId();
    const query = new URLSearchParams({
      limit: String(Math.min(Math.max(input.limit ?? 25, 1), 100)),
      offset: String(Math.max(input.offset ?? 0, 0))
    });
    if (input.state) query.set("state", input.state);
    const page = await this.client.request(`/application/shops/${shopId}/listings?${query}`, {}, PageSchema(ListingSchema));
    return {
      count: page.count,
      results: page.results.map(listing => ({
        listingId: listing.listing_id,
        title: listing.title,
        state: listing.state,
        quantity: listing.quantity,
        price: publicMoney(listing.price)
      }))
    };
  }

  async getListing(listingId: number) {
    const listing = await this.getOwnedListing(listingId);
    const inventory = await this.getListingInventory(listingId);
    return {
      listingId: listing.listing_id,
      title: listing.title,
      description: listing.description ?? "",
      state: listing.state,
      quantity: listing.quantity,
      price: publicMoney(listing.price),
      taxonomyId: listing.taxonomy_id ?? null,
      tags: listing.tags ?? [],
      materials: listing.materials ?? [],
      url: listing.url ?? null,
      inventory
    };
  }

  async getListingState(listingId: number): Promise<ListingState> {
    const listing = await this.getOwnedListing(listingId);
    return listing.state;
  }

  async getListingInventory(listingId: number) {
    const inventory = await this.client.request(`/application/listings/${listingId}/inventory?max_variations_supported=3`, {}, InventorySchema);
    return publicInventory(inventory);
  }
}
