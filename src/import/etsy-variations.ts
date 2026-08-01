import type { EnrichedWorkbookRow } from "./excel.js";

export interface ImportedProduct {
  productName: string;
  rawChineseDescription?: string;
  imageFolderId: string | null;
  imageFolderName: string | null;
  imageCount: number;
  images?: unknown[];
}

export interface EtsyVariationVariant {
  product: ImportedProduct;
  variation1Value: string;
}

export interface EtsyVariationGroup {
  listingGroup: string;
  variation1Name?: "Color";
  variants: EtsyVariationVariant[];
  validationStatus: "ready" | "single";
  validationNotes?: string;
}

export interface EtsyVariationWorkbookRow extends EnrichedWorkbookRow {
  listingGroup: string;
  parentListingTitle: string;
  parentListingDescription: string;
  isVariant: "yes" | "no";
  variation1Name: string;
  variation1Value: string;
  variantImageFolder: string;
  variantImageCount: number;
  variationValidationStatus: string;
  variationValidationNotes: string;
}

const CHINESE_COLOR_SUFFIXES = new Map([
  ["紫色", "Purple"],
  ["蓝色", "Blue"],
  ["黄色", "Yellow"],
  ["粉色", "Pink"],
  ["粉红色", "Pink"],
  ["橙色", "Orange"],
  ["红色", "Red"],
  ["绿色", "Green"],
  ["白色", "White"],
  ["黑色", "Black"]
]);

function inferColorSuffix(productName: string) {
  const match = productName.match(/^(.+?)[\-－—_ ]([^\-－—_ ]+)$/u);
  if (!match) return null;
  const listingGroup = match[1]?.trim();
  const suffix = match[2]?.trim();
  if (!listingGroup || !suffix) return null;
  const color = CHINESE_COLOR_SUFFIXES.get(suffix);
  if (!color) return null;
  return { listingGroup, variation1Value: color };
}

function singleListing(product: ImportedProduct): EtsyVariationGroup {
  return {
    listingGroup: product.productName,
    variants: [{ product, variation1Value: "" }],
    validationStatus: "single"
  };
}

export function inferEtsyVariationGroups(products: ImportedProduct[]): EtsyVariationGroup[] {
  const inferences = products.map(product => ({ product, inferred: inferColorSuffix(product.productName) }));
  const countsByListingGroup = new Map<string, number>();
  for (const { inferred } of inferences) {
    if (inferred) countsByListingGroup.set(inferred.listingGroup, (countsByListingGroup.get(inferred.listingGroup) ?? 0) + 1);
  }

  const groups: EtsyVariationGroup[] = [];
  const emittedGroups = new Set<string>();
  for (const { product, inferred } of inferences) {
    if (!inferred || (countsByListingGroup.get(inferred.listingGroup) ?? 0) < 2) {
      groups.push(singleListing(product));
      continue;
    }
    if (emittedGroups.has(inferred.listingGroup)) continue;
    emittedGroups.add(inferred.listingGroup);
    groups.push({
      listingGroup: inferred.listingGroup,
      variation1Name: "Color",
      variants: inferences
        .filter(entry => entry.inferred?.listingGroup === inferred.listingGroup)
        .map(entry => ({ product: entry.product, variation1Value: entry.inferred?.variation1Value ?? "" })),
      validationStatus: "ready"
    });
  }
  return groups;
}

export function toEtsyVariationWorkbookRows(groups: EtsyVariationGroup[]): EtsyVariationWorkbookRow[] {
  return groups.flatMap(group => group.variants.map(variant => {
    const product = variant.product;
    const isVariant = group.validationStatus === "ready";
    return {
      productName: product.productName,
      rawChineseDescription: product.rawChineseDescription ?? "",
      imageFolder: product.imageFolderName ?? "",
      imageCount: product.imageCount,
      listingGroup: group.listingGroup,
      parentListingTitle: group.listingGroup,
      parentListingDescription: group.variants[0]?.product.rawChineseDescription ?? "",
      isVariant: isVariant ? "yes" : "no",
      variation1Name: group.variation1Name ?? "",
      variation1Value: variant.variation1Value,
      variantImageFolder: product.imageFolderName ?? "",
      variantImageCount: product.imageCount,
      variationValidationStatus: group.validationStatus,
      variationValidationNotes: group.validationNotes ?? ""
    };
  }));
}
