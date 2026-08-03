# Etsy Variation Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build variation-aware Etsy draft preparation so several Drive products such as `郁金香兔-紫色`, `郁金香兔-蓝色`, `郁金香兔-黄色`, and `郁金香兔-粉色` can become one unpublished Etsy draft with Color variations.

**Architecture:** Add a small import-domain module that groups Drive products into Etsy listing groups, then extend workbook read/write support to carry those grouping decisions. Add a second module that converts reviewed workbook rows into Etsy draft create input, image upload plans, and inventory payloads, then expose preview/confirm MCP tools that reuse the existing draft-only write services.

**Tech Stack:** TypeScript, Zod, Vitest, xlsx, Etsy Open API v3, Google Drive API, local MCP server, existing `ConfirmationStore`.

---

## File structure

- Create `src/import/etsy-variations.ts`: grouping inference, color translation, grouped-folder interpretation, and workbook-row helpers.
- Modify `src/import/excel.ts`: add variation columns to `EnrichedWorkbookRow`, `ENRICHED_HEADERS`, and `writeEnrichedWorkbook`.
- Modify `src/import/enriched.ts`: parse new variation columns from `Product Information - Etsy Draft.xlsx`.
- Modify `src/import/drive-import.ts`: return enough image-folder metadata to support both flat product folders and future grouped parent folders.
- Create `src/import/etsy-variation-draft.ts`: build draft-create inputs, grouped image plans, and inventory inputs from reviewed enriched rows.
- Modify `src/import/drive-image-upload.ts`: add grouped image upload preview/confirm support while preserving current single-product upload behavior.
- Modify `src/tools/import-tools.ts`: add preview helpers for variation workbook generation and grouped draft payload generation.
- Modify `src/tools/drive-image-tools.ts`: add grouped Drive image upload tool.
- Modify `src/tools/write-tools.ts`: add one helper method for previewing/confirming variation inventory only if needed; otherwise reuse `previewInventory` and `confirmInventory`.
- Modify `src/server.ts` and `tests/mcp-integration.test.ts`: register and verify the new MCP tool names.
- Create `tests/etsy-variations.test.ts`: unit tests for grouping and workbook row generation.
- Modify `tests/enriched.test.ts`: assert variation columns round-trip.
- Modify `tests/import-tools.test.ts`: assert variation workbook and grouped draft previews.
- Modify `tests/drive-image-upload.test.ts`: assert grouped image upload planning and draft-only confirmation.
- Create `tests/etsy-variation-draft.test.ts`: unit tests for draft and inventory payload generation.

## Tool names and safety behavior

Add these MCP tools:

- `shopweaver_preview_etsy_variation_groups`
  - Read-only.
  - Imports one allowed Drive folder and previews inferred listing groups.
- `shopweaver_write_etsy_variation_workbook`
  - Google Drive workbook write only.
  - `mode: "preview" | "confirm"`.
  - Writes `Product Information - Etsy Draft.xlsx` with variation columns.
- `shopweaver_preview_etsy_variation_draft`
  - Read-only.
  - Builds the draft-create payload, inventory payload, and image upload plan for one listing group from reviewed rows.
- `shopweaver_upload_drive_variation_images_to_etsy_draft`
  - Etsy draft image write only.
  - `mode: "preview" | "confirm"`.
  - Requires exact confirmation token.

Do not add publish, delete, active-listing update, ads, refunds, shipments, messages, or email tools.

---

### Task 1: Add variation grouping model and flat-name inference

**Files:**
- Create: `src/import/etsy-variations.ts`
- Create: `tests/etsy-variations.test.ts`

- [ ] **Step 1: Write failing grouping tests**

Add this test file:

```ts
import { describe, expect, it } from "vitest";
import { inferEtsyVariationGroups, toEtsyVariationWorkbookRows } from "../src/import/etsy-variations.js";

const products = [
  { productName: "郁金香兔-紫色", rawChineseDescription: "紫色兔子", imageFolderId: "purple-folder", imageFolderName: "郁金香兔-紫色", imageCount: 4, images: [] },
  { productName: "郁金香兔-蓝色", rawChineseDescription: "蓝色兔子", imageFolderId: "blue-folder", imageFolderName: "郁金香兔-蓝色", imageCount: 5, images: [] },
  { productName: "独立挂件", rawChineseDescription: "单独产品", imageFolderId: "solo-folder", imageFolderName: "独立挂件", imageCount: 3, images: [] }
];

describe("Etsy variation grouping", () => {
  it("groups flat Chinese color product names into one Color variation listing", () => {
    const groups = inferEtsyVariationGroups(products);
    expect(groups.find(group => group.listingGroup === "郁金香兔")).toMatchObject({
      listingGroup: "郁金香兔",
      variation1Name: "Color",
      validationStatus: "ready"
    });
    expect(groups.find(group => group.listingGroup === "郁金香兔")?.variants.map(variant => variant.variation1Value)).toEqual(["Purple", "Blue"]);
  });

  it("keeps products without safe suffix inference as single listings", () => {
    const groups = inferEtsyVariationGroups(products);
    expect(groups.find(group => group.listingGroup === "独立挂件")).toMatchObject({
      listingGroup: "独立挂件",
      validationStatus: "single"
    });
  });

  it("writes workbook rows with explicit grouping fields", () => {
    const rows = toEtsyVariationWorkbookRows(inferEtsyVariationGroups(products));
    expect(rows.find(row => row.productName === "郁金香兔-紫色")).toMatchObject({
      listingGroup: "郁金香兔",
      isVariant: "yes",
      variation1Name: "Color",
      variation1Value: "Purple",
      variantImageFolder: "郁金香兔-紫色",
      variationValidationStatus: "ready"
    });
    expect(rows.find(row => row.productName === "独立挂件")).toMatchObject({
      listingGroup: "独立挂件",
      isVariant: "no",
      variationValidationStatus: "single"
    });
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- tests/etsy-variations.test.ts
```

Expected: fail because `src/import/etsy-variations.ts` does not exist.

- [ ] **Step 3: Implement the minimal grouping module**

Create `src/import/etsy-variations.ts`:

```ts
import type { EnrichedWorkbookRow } from "./excel.js";

type ImportedProduct = {
  productName: string;
  rawChineseDescription?: string;
  imageFolderId: string | null;
  imageFolderName: string | null;
  imageCount: number;
  images?: unknown[];
};

export type EtsyVariationVariant = {
  productName: string;
  rawChineseDescription?: string;
  variation1Value?: string;
  imageFolderName: string | null;
  imageCount: number;
};

export type EtsyVariationGroup = {
  listingGroup: string;
  variation1Name?: string;
  validationStatus: "ready" | "single" | "needs_review";
  validationNotes: string;
  variants: EtsyVariationVariant[];
};

const COLOR_SUFFIXES = new Map([
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

function splitFlatColorName(name: string) {
  const match = /^(.+?)[-－—_ ]([^\\-－—_ ]+)$/.exec(name.trim());
  if (!match) return null;
  const color = COLOR_SUFFIXES.get(match[2]);
  if (!color) return null;
  return { groupName: match[1].trim(), color };
}

export function inferEtsyVariationGroups(products: ImportedProduct[]): EtsyVariationGroup[] {
  const grouped = new Map<string, EtsyVariationVariant[]>();
  const singles: EtsyVariationGroup[] = [];
  for (const product of products) {
    const inferred = splitFlatColorName(product.productName);
    if (!inferred) {
      singles.push({
        listingGroup: product.productName,
        validationStatus: "single",
        validationNotes: "No safe variation suffix was found.",
        variants: [{
          productName: product.productName,
          rawChineseDescription: product.rawChineseDescription,
          imageFolderName: product.imageFolderName,
          imageCount: product.imageCount
        }]
      });
      continue;
    }
    const variants = grouped.get(inferred.groupName) ?? [];
    variants.push({
      productName: product.productName,
      rawChineseDescription: product.rawChineseDescription,
      variation1Value: inferred.color,
      imageFolderName: product.imageFolderName,
      imageCount: product.imageCount
    });
    grouped.set(inferred.groupName, variants);
  }
  const variationGroups = [...grouped.entries()].map(([listingGroup, variants]) => variants.length > 1
    ? {
        listingGroup,
        variation1Name: "Color",
        validationStatus: "ready" as const,
        validationNotes: "Grouped by recognized color suffix.",
        variants
      }
    : {
        listingGroup: variants[0].productName,
        validationStatus: "single" as const,
        validationNotes: "Only one recognized variant was found.",
        variants
      });
  return [...variationGroups, ...singles];
}

export function toEtsyVariationWorkbookRows(groups: EtsyVariationGroup[]): EnrichedWorkbookRow[] {
  return groups.flatMap(group => group.variants.map(variant => ({
    productName: variant.productName,
    rawChineseDescription: variant.rawChineseDescription,
    imageFolder: variant.imageFolderName ?? undefined,
    imageCount: variant.imageCount,
    listingGroup: group.listingGroup,
    parentListingTitle: group.listingGroup,
    parentListingDescription: group.variants.map(item => item.rawChineseDescription).filter(Boolean).join("\\n"),
    isVariant: group.validationStatus === "ready" ? "yes" : "no",
    variation1Name: group.variation1Name,
    variation1Value: variant.variation1Value,
    variantImageFolder: variant.imageFolderName ?? undefined,
    variantImageCount: variant.imageCount,
    variationValidationStatus: group.validationStatus,
    variationValidationNotes: group.validationNotes
  })));
}
```

- [ ] **Step 4: Run the grouping test and verify it passes**

Run:

```bash
npm test -- tests/etsy-variations.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/import/etsy-variations.ts tests/etsy-variations.test.ts
git commit -m "feat: infer Etsy variation groups"
```

---

### Task 2: Add variation columns to the Etsy workbook

**Files:**
- Modify: `src/import/excel.ts`
- Modify: `src/import/enriched.ts`
- Modify: `tests/enriched.test.ts`

- [ ] **Step 1: Add failing workbook round-trip assertions**

Extend the first test in `tests/enriched.test.ts`:

```ts
const bytes = writeEnrichedWorkbook([{
  productName: "郁金香兔-紫色",
  rawChineseDescription: "紫色兔子",
  imageFolder: "郁金香兔-紫色",
  imageCount: 4,
  listingGroup: "郁金香兔",
  parentListingTitle: "Handmade Crochet Tulip Bunny",
  parentListingDescription: "A handmade crochet tulip bunny with selectable colors.",
  isVariant: "yes",
  variation1Name: "Color",
  variation1Value: "Purple",
  sku: "tulip-bunny-purple",
  variantPrice: "18.99",
  variantQuantity: 1,
  variantImageFolder: "郁金香兔-紫色",
  variantImageCount: 4,
  variationValidationStatus: "ready",
  variationValidationNotes: "Grouped by recognized color suffix."
}]);
const rows = parseEnrichedRows(bytes);
expect(rows[0]).toMatchObject({
  listingGroup: "郁金香兔",
  isVariant: "yes",
  variation1Name: "Color",
  variation1Value: "Purple",
  sku: "tulip-bunny-purple",
  variantPrice: "18.99",
  variantQuantity: 1
});
```

- [ ] **Step 2: Run the enriched workbook test and verify it fails**

Run:

```bash
npm test -- tests/enriched.test.ts
```

Expected: fail because new fields are not written or parsed.

- [ ] **Step 3: Extend `EnrichedWorkbookRow` and headers**

In `src/import/excel.ts`, add these optional fields to `EnrichedWorkbookRow`:

```ts
  listingGroup?: string;
  parentListingTitle?: string;
  parentListingDescription?: string;
  isVariant?: string;
  variation1Name?: string;
  variation1Value?: string;
  variation2Name?: string;
  variation2Value?: string;
  sku?: string;
  variantPrice?: string;
  variantQuantity?: number;
  variantImageFolder?: string;
  variantImageCount?: number;
  variationValidationStatus?: string;
  variationValidationNotes?: string;
```

Append these headers after `"Validation Notes"` in `ENRICHED_HEADERS`:

```ts
  "Listing Group",
  "Parent Listing Title",
  "Parent Listing Description",
  "Is Variant",
  "Variation 1 Name",
  "Variation 1 Value",
  "Variation 2 Name",
  "Variation 2 Value",
  "SKU",
  "Variant Price",
  "Variant Quantity",
  "Variant Image Folder",
  "Variant Image Count",
  "Variation Validation Status",
  "Variation Validation Notes"
```

Append matching row values in `writeEnrichedWorkbook`.

- [ ] **Step 4: Extend enriched row parsing**

In `src/import/enriched.ts`, add the same fields to `EnrichedDraftRowSchema`, and map these workbook columns in `parseEnrichedRows`:

```ts
listingGroup: text(row["Listing Group"]),
parentListingTitle: text(row["Parent Listing Title"]),
parentListingDescription: text(row["Parent Listing Description"]),
isVariant: text(row["Is Variant"]),
variation1Name: text(row["Variation 1 Name"]),
variation1Value: text(row["Variation 1 Value"]),
variation2Name: text(row["Variation 2 Name"]),
variation2Value: text(row["Variation 2 Value"]),
sku: text(row["SKU"]),
variantPrice: text(row["Variant Price"]),
variantQuantity: number(row["Variant Quantity"]),
variantImageFolder: text(row["Variant Image Folder"]),
variantImageCount: number(row["Variant Image Count"]),
variationValidationStatus: text(row["Variation Validation Status"]),
variationValidationNotes: text(row["Variation Validation Notes"])
```

- [ ] **Step 5: Run enriched tests**

Run:

```bash
npm test -- tests/enriched.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/import/excel.ts src/import/enriched.ts tests/enriched.test.ts
git commit -m "feat: add Etsy variation workbook columns"
```

---

### Task 3: Add variation workbook preview/write tool

**Files:**
- Modify: `src/tools/import-tools.ts`
- Modify: `tests/import-tools.test.ts`

- [ ] **Step 1: Add failing import tool tests**

Add tests that mock `DriveImportService.importFolder` and `writeEnrichedWorkbook`:

```ts
it("previews Etsy variation groups from an allowed Drive folder", async () => {
  const imports = {
    importFolder: vi.fn().mockResolvedValue({
      products: [
        { productName: "郁金香兔-紫色", rawChineseDescription: "紫色兔子", imageFolderId: "p", imageFolderName: "郁金香兔-紫色", imageCount: 4, images: [] },
        { productName: "郁金香兔-蓝色", rawChineseDescription: "蓝色兔子", imageFolderId: "b", imageFolderName: "郁金香兔-蓝色", imageCount: 5, images: [] }
      ]
    })
  };
  const preview = await previewEtsyVariationGroups(imports as never, "folder");
  expect(preview.groups[0]).toMatchObject({ listingGroup: "郁金香兔", variation1Name: "Color" });
  expect(preview.rowCount).toBe(2);
});

it("writes an Etsy variation workbook after confirm mode", async () => {
  const imports = {
    importFolder: vi.fn().mockResolvedValue({
      products: [
        { productName: "郁金香兔-紫色", rawChineseDescription: "紫色兔子", imageFolderId: "p", imageFolderName: "郁金香兔-紫色", imageCount: 4, images: [] },
        { productName: "郁金香兔-蓝色", rawChineseDescription: "蓝色兔子", imageFolderId: "b", imageFolderName: "郁金香兔-蓝色", imageCount: 5, images: [] }
      ]
    }),
    writeEnrichedWorkbook: vi.fn().mockResolvedValue({ id: "workbook", name: "Product Information - Etsy Draft.xlsx" })
  };
  const result = await writeEtsyVariationWorkbook(imports as never, "folder");
  expect(imports.writeEnrichedWorkbook).toHaveBeenCalledWith("folder", expect.arrayContaining([
    expect.objectContaining({ listingGroup: "郁金香兔", variation1Value: "Purple" })
  ]));
  expect(result.file.id).toBe("workbook");
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- tests/import-tools.test.ts
```

Expected: fail because helper functions do not exist.

- [ ] **Step 3: Implement exported helpers**

In `src/tools/import-tools.ts`, import:

```ts
import { inferEtsyVariationGroups, toEtsyVariationWorkbookRows } from "../import/etsy-variations.js";
```

Add:

```ts
export async function previewEtsyVariationGroups(imports: DriveImportService, folderId: string) {
  const imported = await imports.importFolder(folderId);
  const groups = inferEtsyVariationGroups(imported.products);
  return {
    operation: "preview_etsy_variation_groups" as const,
    folderId,
    groupCount: groups.length,
    rowCount: groups.reduce((count, group) => count + group.variants.length, 0),
    groups,
    warning: "This is read-only. Review grouping before creating any Etsy draft."
  };
}

export async function writeEtsyVariationWorkbook(imports: DriveImportService, folderId: string) {
  const imported = await imports.importFolder(folderId);
  const rows = toEtsyVariationWorkbookRows(inferEtsyVariationGroups(imported.products));
  const file = await imports.writeEnrichedWorkbook(folderId, rows);
  return {
    operation: "write_etsy_variation_workbook" as const,
    folderId,
    rowCount: rows.length,
    file,
    warning: "This wrote Product Information - Etsy Draft.xlsx to Google Drive only. It did not call Etsy."
  };
}
```

- [ ] **Step 4: Register MCP tools**

In `registerImportTools`, add:

```ts
server.registerTool("shopweaver_preview_etsy_variation_groups", {
  description: "Preview inferred Etsy variation groups from one explicitly allowed Google Drive folder. This is read-only.",
  inputSchema: { folderId: z.string().min(1) }
}, async ({ folderId }) => result(await previewEtsyVariationGroups(imports, folderId)));

server.registerTool("shopweaver_write_etsy_variation_workbook", {
  description: "Preview or confirm writing Product Information - Etsy Draft.xlsx with Etsy variation columns. This writes to Google Drive only and does not call Etsy.",
  inputSchema: { mode: z.enum(["preview", "confirm"]).default("preview"), folderId: z.string().min(1) }
}, async ({ mode, folderId }) => result(mode === "preview"
  ? { operation: "write_etsy_variation_workbook", folderId, warning: "This will write Product Information - Etsy Draft.xlsx to Google Drive only in confirm mode." }
  : await writeEtsyVariationWorkbook(imports, folderId)));
```

- [ ] **Step 5: Run import tool tests**

Run:

```bash
npm test -- tests/import-tools.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/import-tools.ts tests/import-tools.test.ts
git commit -m "feat: write Etsy variation workbook"
```

---

### Task 4: Build grouped draft and inventory preview payloads

**Files:**
- Create: `src/import/etsy-variation-draft.ts`
- Create: `tests/etsy-variation-draft.test.ts`

- [ ] **Step 1: Write failing payload-builder tests**

Create `tests/etsy-variation-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildEtsyVariationDraftPreview } from "../src/import/etsy-variation-draft.js";

const rows = [
  {
    productName: "郁金香兔-紫色",
    englishTitle: "Handmade Crochet Tulip Bunny",
    englishDescription: "A soft handmade crochet bunny.",
    quantity: 1,
    price: "18.99",
    taxonomyId: 2078,
    whoMade: "i_did",
    whenMade: "2020_2026",
    type: "physical",
    readinessStateId: 1,
    listingGroup: "郁金香兔",
    parentListingTitle: "Handmade Crochet Tulip Bunny",
    parentListingDescription: "A soft handmade crochet bunny with color options.",
    isVariant: "yes",
    variation1Name: "Color",
    variation1Value: "Purple",
    sku: "tulip-bunny-purple",
    variantPrice: "18.99",
    variantQuantity: 1,
    variantImageFolder: "郁金香兔-紫色",
    variantImageCount: 4
  },
  {
    productName: "郁金香兔-蓝色",
    englishTitle: "Handmade Crochet Tulip Bunny",
    englishDescription: "A soft handmade crochet bunny.",
    quantity: 1,
    price: "18.99",
    taxonomyId: 2078,
    whoMade: "i_did",
    whenMade: "2020_2026",
    type: "physical",
    readinessStateId: 1,
    listingGroup: "郁金香兔",
    parentListingTitle: "Handmade Crochet Tulip Bunny",
    parentListingDescription: "A soft handmade crochet bunny with color options.",
    isVariant: "yes",
    variation1Name: "Color",
    variation1Value: "Blue",
    sku: "tulip-bunny-blue",
    variantPrice: "18.99",
    variantQuantity: 1,
    variantImageFolder: "郁金香兔-蓝色",
    variantImageCount: 5
  }
];

describe("Etsy variation draft preview", () => {
  it("builds one draft create payload and color inventory payload for a listing group", () => {
    const preview = buildEtsyVariationDraftPreview(rows as never, "郁金香兔", { propertyId: 200 });
    expect(preview.draft.title).toBe("Handmade Crochet Tulip Bunny");
    expect(preview.draft.quantity).toBe(2);
    expect(preview.inventory.products).toHaveLength(2);
    expect(preview.inventory.products[0]).toMatchObject({
      sku: "tulip-bunny-purple",
      propertyValues: [{ propertyId: 200, propertyName: "Color", valueIds: [], values: ["Purple"] }]
    });
    expect(preview.imagePlan.variantFolders).toEqual(["郁金香兔-紫色", "郁金香兔-蓝色"]);
  });

  it("rejects rows that still need grouping review", () => {
    expect(() => buildEtsyVariationDraftPreview([{ ...rows[0], variationValidationStatus: "needs_review" }] as never, "郁金香兔", { propertyId: 200 })).toThrow("Variation rows must be reviewed");
  });
});
```

- [ ] **Step 2: Run the new test and verify failure**

Run:

```bash
npm test -- tests/etsy-variation-draft.test.ts
```

Expected: fail because `src/import/etsy-variation-draft.ts` does not exist.

- [ ] **Step 3: Implement payload builder**

Create `src/import/etsy-variation-draft.ts`:

```ts
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
  if (!first.parentListingTitle && !first.englishTitle) throw new ShopWeaverError("VARIATION_TITLE_REQUIRED", "Parent Listing Title or English Title is required.");
  if (!first.parentListingDescription && !first.englishDescription) throw new ShopWeaverError("VARIATION_DESCRIPTION_REQUIRED", "Parent Listing Description or English Description is required.");
  if (first.taxonomyId === undefined) throw new ShopWeaverError("VARIATION_TAXONOMY_REQUIRED", "Taxonomy ID is required.");
  if (!first.whoMade || !first.whenMade || first.type !== "physical" || first.readinessStateId === undefined) {
    throw new ShopWeaverError("VARIATION_PHYSICAL_FIELDS_REQUIRED", "Who Made, When Made, physical Type, and Readiness State ID are required.");
  }
  const inventory: InventoryInput = {
    products: groupRows.map((row, index) => {
      const value = row.variation1Value;
      if (!value) throw new ShopWeaverError("VARIATION_VALUE_REQUIRED", "Variation 1 Value is required for each variant row.");
      return {
        sku: row.sku || `${listingGroup}-${value}`.toLowerCase().replace(/\\s+/g, "-"),
        propertyValues: [{
          propertyId: property.propertyId,
          propertyName: row.variation1Name || "Color",
          valueIds: [],
          values: [value]
        }],
        offerings: [{
          quantity: row.variantQuantity ?? row.quantity ?? 1,
          enabled: true,
          price: row.variantPrice ?? row.price ?? first.price ?? "1.00",
          readinessStateId: row.readinessStateId ?? first.readinessStateId
        }]
      };
    }),
    priceOnProperty: [],
    quantityOnProperty: [],
    skuOnProperty: []
  };
  return {
    operation: "preview_etsy_variation_draft" as const,
    listingGroup,
    draft: {
      title: first.parentListingTitle ?? first.englishTitle,
      description: first.parentListingDescription ?? first.englishDescription,
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
```

- [ ] **Step 4: Run payload-builder tests**

Run:

```bash
npm test -- tests/etsy-variation-draft.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/import/etsy-variation-draft.ts tests/etsy-variation-draft.test.ts
git commit -m "feat: build Etsy variation draft previews"
```

---

### Task 5: Expose grouped draft preview from enriched workbook rows

**Files:**
- Modify: `src/tools/import-tools.ts`
- Modify: `tests/import-tools.test.ts`
- Modify: `tests/mcp-integration.test.ts`

- [ ] **Step 1: Add failing tool registration test**

In `tests/mcp-integration.test.ts`, add the expected tool:

```ts
"shopweaver_preview_etsy_variation_draft",
```

In `tests/import-tools.test.ts`, add:

```ts
it("previews a reviewed Etsy variation draft from workbook rows", async () => {
  const preview = previewEtsyVariationDraftFromRows([{
    productName: "郁金香兔-紫色",
    englishTitle: "Handmade Crochet Tulip Bunny",
    englishDescription: "A soft handmade crochet bunny.",
    quantity: 1,
    price: "18.99",
    taxonomyId: 2078,
    whoMade: "i_did",
    whenMade: "2020_2026",
    type: "physical",
    readinessStateId: 1,
    listingGroup: "郁金香兔",
    parentListingTitle: "Handmade Crochet Tulip Bunny",
    parentListingDescription: "A soft handmade crochet bunny with color options.",
    isVariant: "yes",
    variation1Name: "Color",
    variation1Value: "Purple",
    sku: "tulip-bunny-purple",
    variantPrice: "18.99",
    variantQuantity: 1,
    variantImageFolder: "郁金香兔-紫色"
  } as never], "郁金香兔", 200);
  expect(preview.inventory.products[0].propertyValues[0].propertyId).toBe(200);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- tests/import-tools.test.ts tests/mcp-integration.test.ts
```

Expected: fail because helper and tool registration do not exist.

- [ ] **Step 3: Implement helper and register the tool**

In `src/tools/import-tools.ts`, import:

```ts
import { buildEtsyVariationDraftPreview } from "../import/etsy-variation-draft.js";
```

Add:

```ts
export function previewEtsyVariationDraftFromRows(rows: z.input<typeof EnrichedDraftRowSchema>[], listingGroup: string, variation1PropertyId: number) {
  const parsed = rows.map(row => EnrichedDraftRowSchema.parse(row));
  return buildEtsyVariationDraftPreview(parsed, listingGroup, { propertyId: variation1PropertyId });
}
```

Register:

```ts
server.registerTool("shopweaver_preview_etsy_variation_draft", {
  description: "Preview one Etsy grouped draft payload, image plan, and inventory payload from reviewed Etsy Draft workbook rows. This is read-only.",
  inputSchema: {
    listingGroup: z.string().min(1),
    variation1PropertyId: z.number().int().positive(),
    rows: z.array(EnrichedDraftRowSchema).min(1)
  }
}, async ({ rows, listingGroup, variation1PropertyId }) => result(previewEtsyVariationDraftFromRows(rows, listingGroup, variation1PropertyId)));
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/import-tools.test.ts tests/mcp-integration.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/import-tools.ts tests/import-tools.test.ts tests/mcp-integration.test.ts
git commit -m "feat: preview Etsy variation drafts"
```

---

### Task 6: Support grouped Drive image upload plans

**Files:**
- Modify: `src/import/drive-image-upload.ts`
- Modify: `src/tools/drive-image-tools.ts`
- Modify: `tests/drive-image-upload.test.ts`
- Modify: `tests/mcp-integration.test.ts`

- [ ] **Step 1: Add failing grouped image upload tests**

In `tests/drive-image-upload.test.ts`, add a test that sets up `Images/郁金香兔-紫色` and `Images/郁金香兔-蓝色`, then previews both folders for one listing:

```ts
it("previews grouped variant image uploads in rank order", async () => {
  const { uploads } = await service({
    listFolderChildren: vi.fn().mockResolvedValue([
      { id: "images", name: "Images", mimeType: "application/vnd.google-apps.folder" }
    ]),
    listChildrenByParentId: vi.fn()
      .mockResolvedValueOnce([
        { id: "purple", name: "郁金香兔-紫色", mimeType: "application/vnd.google-apps.folder" },
        { id: "blue", name: "郁金香兔-蓝色", mimeType: "application/vnd.google-apps.folder" }
      ])
      .mockResolvedValueOnce([{ id: "p1", name: "01.jpg", mimeType: "image/jpeg" }])
      .mockResolvedValueOnce([{ id: "b1", name: "01.jpg", mimeType: "image/jpeg" }])
  });
  const preview = await uploads.previewVariationUpload({
    listingId: 9,
    folderId: "folder",
    variantImageFolders: ["郁金香兔-紫色", "郁金香兔-蓝色"]
  });
  expect(preview.images.map(image => image.rank)).toEqual([1, 2]);
  expect(preview.images.map(image => image.variantImageFolder)).toEqual(["郁金香兔-紫色", "郁金香兔-蓝色"]);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- tests/drive-image-upload.test.ts tests/mcp-integration.test.ts
```

Expected: fail because grouped upload methods and tool are missing.

- [ ] **Step 3: Add grouped upload input and planner**

In `src/import/drive-image-upload.ts`, add:

```ts
export type DriveVariationImageUploadInput = {
  listingId: number;
  folderId: string;
  variantImageFolders: string[];
  maxImagesPerVariant?: number;
};
```

Add `previewVariationUpload` and `confirmVariationUpload` by reusing the existing `buildPlan` logic, but taking an ordered array of product folder names and assigning ranks across all selected variant folders. Confirmation must:

- use `this.confirmations.issue("upload_drive_variation_images", shopId, plan, input.listingId)` in preview
- consume the same operation name in confirm
- call `getListingState` and reject non-drafts
- download and upload each image exactly like `confirmUpload`

- [ ] **Step 4: Register grouped image upload tool**

In `src/tools/drive-image-tools.ts`, add schema:

```ts
const DriveVariationImageUploadInput = {
  mode: z.enum(["preview", "confirm"]).default("preview"),
  confirmationToken: z.string().min(20).optional(),
  listingId: z.number().int().positive(),
  folderId: z.string().min(1),
  variantImageFolders: z.array(z.string().min(1)).min(1),
  maxImagesPerVariant: z.number().int().positive().max(10).optional()
};
```

Register:

```ts
server.registerTool("shopweaver_upload_drive_variation_images_to_etsy_draft", {
  description: "Preview or confirm uploading Google Drive variant images to one Etsy draft listing. Active listings are rejected.",
  inputSchema: DriveVariationImageUploadInput
}, async ({ mode, confirmationToken, ...input }) => result(mode === "preview"
  ? await uploads.previewVariationUpload(input)
  : await uploads.confirmVariationUpload(input, confirmationToken ?? "")));
```

Add `"shopweaver_upload_drive_variation_images_to_etsy_draft"` to `tests/mcp-integration.test.ts`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/drive-image-upload.test.ts tests/mcp-integration.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/import/drive-image-upload.ts src/tools/drive-image-tools.ts tests/drive-image-upload.test.ts tests/mcp-integration.test.ts
git commit -m "feat: upload Etsy variation images from Drive"
```

---

### Task 7: Update docs and safety allowlist

**Files:**
- Modify: `README.md`
- Modify: `skills/shopweaver/SKILL.md`
- Modify: `scripts/check-forbidden-tools.mjs`
- Modify: `tests/skill.test.ts`

- [ ] **Step 1: Add expected safety names**

Update `scripts/check-forbidden-tools.mjs` so the new tools are allowed only if their descriptions include preview/confirm or read-only language:

```js
"shopweaver_preview_etsy_variation_groups",
"shopweaver_write_etsy_variation_workbook",
"shopweaver_preview_etsy_variation_draft",
"shopweaver_upload_drive_variation_images_to_etsy_draft"
```

Do not add any publish/delete/active listing write tool.

- [ ] **Step 2: Document the user workflow**

In `README.md` and `skills/shopweaver/SKILL.md`, add the variation workflow:

```md
### Etsy variation drafts

Use this when several Drive products should become one Etsy draft listing with options such as Color.

1. Run `shopweaver_preview_etsy_variation_groups`.
2. Run `shopweaver_write_etsy_variation_workbook` in preview mode, then confirm mode.
3. Review `Product Information - Etsy Draft.xlsx` and correct `Listing Group`, `Variation 1 Name`, `Variation 1 Value`, SKU, price, quantity, and image folder columns.
4. Run `shopweaver_preview_etsy_variation_draft` for one listing group.
5. Preview and confirm `etsy_create_draft_listing`.
6. Preview and confirm `shopweaver_upload_drive_variation_images_to_etsy_draft`.
7. Preview and confirm `etsy_update_draft_inventory`.

The listing stays in draft. ShopWeaver does not publish, delete, update active listings, manage ads, process refunds, create shipments, send messages, or email buyers.
```

- [ ] **Step 3: Run docs/safety tests**

Run:

```bash
npm test -- tests/skill.test.ts
npm run verify
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add README.md skills/shopweaver/SKILL.md scripts/check-forbidden-tools.mjs tests/skill.test.ts
git commit -m "docs: document Etsy variation workflow"
```

---

### Task 8: Final verification and push

**Files:**
- No new implementation files.

- [ ] **Step 1: Inspect worktree carefully**

Run:

```bash
git status --short
git log --oneline --decorate -8
```

Expected:

- Only intended project changes are either committed or clearly identified as pre-existing unrelated dirty files.
- Recent commits match Tasks 1-7.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
```

Expected: all tests pass and safety allowlist passes.

- [ ] **Step 3: Push with the personal GitHub route**

Run:

```bash
GIT_SSH_COMMAND='ssh -F /dev/null -o IdentitiesOnly=yes -o IdentityFile=~/.ssh/id_ed25519_shopweaver_personal' \
  git push -u git@github.com:AidanFu/shopweaver-mcp.git codex/etsy-variation-design
```

Expected: branch pushes to `AidanFu/shopweaver-mcp`.

---

## Self-review checklist

- Spec coverage:
  - Flat Drive folder inference: Task 1.
  - Future grouped Drive image upload behavior: Task 6 covers ordered variant folders; deeper nested parent-folder discovery remains compatible because workbook rows are the source of truth.
  - Workbook variation columns: Task 2 and Task 3.
  - Draft preview and draft-only create flow: Task 4 and Task 5.
  - Inventory variation payload generation: Task 4 and existing `etsy_update_draft_inventory`.
  - Variant image uploads: Task 6.
  - Safety boundaries and docs: Task 7.
  - Full verification: Task 8.
- Placeholder scan: no unresolved placeholder markers are intentionally left.
- Scope check: plan is one cohesive Etsy variation workflow and does not implement Amazon/TikTok or publishing.
- Safety check: all Etsy writes remain preview/confirm gated and draft-only.
