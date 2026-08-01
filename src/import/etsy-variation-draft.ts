import { ShopWeaverError } from "../errors.js";
import type { InventoryInput } from "../tools/write-tools.js";
import type { EnrichedDraftRow } from "./enriched.js";

type VariationPropertyInput = {
  propertyId: number;
};

export function buildEtsyVariationDraftPreview(rows: EnrichedDraftRow[], listingGroup: string, property: VariationPropertyInput) {
  const groupRows = rows.filter(row => row.listingGroup === listingGroup);
  if (groupRows.length === 0) throw new ShopWeaverError("VARIATION_GROUP_NOT_FOUND", "No workbook rows matched the requested listing group.");
  if (groupRows.some(row => row.variationValidationStatus === "needs_review")) {
    throw new ShopWeaverError("VARIATION_GROUP_NEEDS_REVIEW", "Variation rows must be reviewed before Etsy draft creation.");
  }
  const first = groupRows[0];
  const title = first.parentListingTitle?.trim() || first.englishTitle?.trim();
  const description = first.parentListingDescription?.trim() || first.englishDescription?.trim();
  if (!title) throw new ShopWeaverError("VARIATION_TITLE_REQUIRED", "Parent Listing Title or English Title is required.");
  if (!description) throw new ShopWeaverError("VARIATION_DESCRIPTION_REQUIRED", "Parent Listing Description or English Description is required.");
  if (first.taxonomyId === undefined) throw new ShopWeaverError("VARIATION_TAXONOMY_REQUIRED", "Taxonomy ID is required.");
  if (!first.whoMade || !first.whenMade || first.type !== "physical" || first.readinessStateId === undefined) {
    throw new ShopWeaverError("VARIATION_PHYSICAL_FIELDS_REQUIRED", "Who Made, When Made, physical Type, and Readiness State ID are required.");
  }
  const seenValues = new Set<string>();
  const variants = groupRows.map(row => {
    const value = row.variation1Value?.trim();
    if (!value) throw new ShopWeaverError("VARIATION_VALUE_REQUIRED", "Variation 1 Value is required for each variant row.");
    if (seenValues.has(value)) throw new ShopWeaverError("VARIATION_VALUE_DUPLICATE", "Variation option values must be unique within a listing group.");
    seenValues.add(value);
    return {
      row,
      value,
      sku: row.sku || `${listingGroup}-${value}`.toLowerCase().replace(/\s+/g, "-"),
      price: row.variantPrice ?? row.price ?? first.price ?? "1.00",
      quantity: row.variantQuantity ?? row.quantity ?? 1
    };
  });
  const differs = <T>(values: T[]) => new Set(values).size > 1;
  const inventory: InventoryInput = {
    products: variants.map(({ row, value, sku, price, quantity }) => {
      return {
        sku,
        propertyValues: [{
          propertyId: property.propertyId,
          propertyName: row.variation1Name || "Color",
          valueIds: [],
          values: [value]
        }],
        offerings: [{
          quantity,
          enabled: true,
          price,
          readinessStateId: row.readinessStateId ?? first.readinessStateId
        }]
      };
    }),
    priceOnProperty: differs(variants.map(variant => variant.price)) ? [property.propertyId] : [],
    quantityOnProperty: differs(variants.map(variant => variant.quantity)) ? [property.propertyId] : [],
    skuOnProperty: differs(variants.map(variant => variant.sku)) ? [property.propertyId] : []
  };
  return {
    operation: "preview_etsy_variation_draft" as const,
    listingGroup,
    draft: {
      title,
      description,
      quantity: inventory.products.reduce((sum, product) => sum + product.offerings[0].quantity, 0),
      price: first.price ?? groupRows[0].variantPrice ?? "1.00",
      whoMade: first.whoMade,
      whenMade: first.whenMade,
      taxonomyId: first.taxonomyId,
      type: "physical" as const,
      tags: first.tags?.split(",").map(tag => tag.trim()).filter(Boolean),
      materials: first.materials?.split(",").map(material => material.trim()).filter(Boolean),
      readinessStateId: first.readinessStateId
    },
    inventory,
    imagePlan: {
      variantFolders: groupRows.map(row => row.variantImageFolder ?? row.imageFolder).filter((folder): folder is string => Boolean(folder))
    },
    warning: "This is a preview only. Create the Etsy draft, upload images, and replace inventory only after separate confirmations."
  };
}
