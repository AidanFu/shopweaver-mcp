# Amazon Listing Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate an Amazon-ready listing optimization workbook from the existing approved Google Drive product import workflow, without making any Amazon API writes.

**Architecture:** Add an Amazon-specific planning layer beside the Etsy enrichment path. Reuse `DriveImportService.importFolder()` for source products and image matches, transform imported rows into category-flexible Amazon planning rows, write `Product Information - Amazon Listing.xlsx` back to the allowed Drive folder, and expose a preview/confirm MCP tool for workbook generation only.

**Tech Stack:** TypeScript, Vitest, Zod, MCP SDK, Google Drive API, `xlsx`.

---

## File Structure

- Modify `src/import/excel.ts`
  - Add Amazon workbook headers and `writeAmazonListingWorkbook(rows)`.
  - Keep existing Etsy workbook functions unchanged.
- Create `src/import/amazon-listing.ts`
  - Define Amazon planning row types.
  - Convert imported Google Drive products into category-flexible Amazon workbook rows.
  - Set review flags when product type/category confidence is uncertain.
- Modify `src/import/drive-import.ts`
  - Add `writeAmazonListingWorkbook(folderId, rows)`.
  - Reuse existing Drive upload behavior and MIME type.
- Modify `src/tools/import-tools.ts`
  - Register `shopweaver_write_amazon_listing_workbook`.
  - Preview mode reports row count, filename, and no-API-write warning.
  - Confirm mode imports the folder, builds Amazon rows, and writes the workbook.
- Modify `scripts/check-forbidden-tools.mjs`
  - Add the new approved MCP tool name.
- Add tests:
  - `tests/amazon-listing.test.ts`
  - Extend `tests/import-excel.test.ts`
  - Extend `tests/import-tools.test.ts`
  - Extend `tests/mcp-integration.test.ts`

## Scope Boundary

This plan must not add:

- Amazon credentials.
- Amazon SP-API clients.
- Amazon listing submission tools.
- Amazon Ads clients.
- A+ Content submission.
- Image editing or image upload.
- Order, shipment, refund, customer-message, or buyer-data access.

The only new output is:

```text
Product Information - Amazon Listing.xlsx
```

## Task 1: Add Amazon Workbook Writer

**Files:**
- Modify: `src/import/excel.ts`
- Test: `tests/import-excel.test.ts`

- [ ] **Step 1: Write the failing workbook writer test**

Modify the existing import in `tests/import-excel.test.ts`:

```ts
import { parseProductInformationWorkbook, writeAmazonListingWorkbook } from "../src/import/excel.js";
```

Append to `tests/import-excel.test.ts`:

```ts
describe("writeAmazonListingWorkbook", () => {
  it("writes Amazon listing planning columns and rows", () => {
    const bytes = writeAmazonListingWorkbook([{
      productName: "产品一",
      sourceChineseDescription: "手工钩织钥匙扣",
      imageFolder: "产品一",
      imageCount: 2,
      amazonProductType: "KEYCHAIN",
      amazonCategoryPath: "Clothing, Shoes & Jewelry > Luggage & Travel Gear > Keychains",
      categoryConfidence: "medium",
      sku: "AMZ-CHAN-PIN-YI",
      parentSku: "",
      variationTheme: "",
      color: "",
      size: "",
      amazonTitle: "Crochet Bag Charm Keychain, Handmade Mini Gift Accessory",
      bullet1: "Handmade crochet charm for bags, keys, backpacks, and gift baskets.",
      bullet2: "Lightweight design makes it easy to carry without adding bulk.",
      bullet3: "Soft textured yarn adds a warm handmade look to everyday accessories.",
      bullet4: "Gift-ready option for birthdays, holidays, party favors, and desk decor.",
      bullet5: "Each piece may have small handmade variations in shape and detail.",
      productDescription: "A compact crochet charm designed for bags, keys, backpacks, and small gifts.",
      backendSearchTerms: "crochet charm bag accessory handmade gift key ring",
      targetCustomer: "Gift buyers and accessory shoppers",
      useCases: "Bag charm; keychain; stocking stuffer",
      mainImageNotes: "Use the clearest product-only image as the main image candidate.",
      lifestyleImageNotes: "Show attached to a bag, backpack, or key ring.",
      infographicImageNotes: "Call out handmade texture, gift use, and lightweight size.",
      sizeImageNotes: "Add a size reference image before Amazon submission.",
      aplusModule1Headline: "Small Handmade Accent",
      aplusModule1Body: "Adds soft crochet texture to everyday carry items.",
      aplusModule2Headline: "Giftable Everyday Charm",
      aplusModule2Body: "Useful for birthdays, holidays, favors, and small thank-you gifts.",
      aplusModule3Headline: "Designed For Flexible Use",
      aplusModule3Body: "Works on keys, bags, backpacks, shelves, and desk displays.",
      adKeywordSeeds: "crochet keychain, handmade bag charm, cute keychain gift",
      negativeKeywordSeeds: "digital, pattern, wholesale",
      suggestedCampaignStructure: "Auto discovery campaign; Manual exact campaign; Manual phrase campaign",
      suggestedPrice: "",
      packageWeight: "",
      packageDimensions: "",
      inventory: "",
      complianceNotes: "Review Amazon product type, choking hazard, and age grading before submission.",
      validationStatus: "needs_review",
      validationNotes: "Review Amazon category/product type before submission."
    }]);
    const workbook = XLSX.read(bytes, { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Amazon Listings"]);
    expect(rows[0]["Product Name"]).toBe("产品一");
    expect(rows[0]["Amazon Product Type"]).toBe("KEYCHAIN");
    expect(rows[0]["Validation Status"]).toBe("needs_review");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run tests/import-excel.test.ts
```

Expected: FAIL because `writeAmazonListingWorkbook` is not exported.

- [ ] **Step 3: Add the Amazon workbook row type and writer**

Append to `src/import/excel.ts`:

```ts
export interface AmazonListingWorkbookRow {
  productName: string;
  sourceChineseDescription?: string;
  imageFolder?: string;
  imageCount?: number;
  amazonProductType?: string;
  amazonCategoryPath?: string;
  categoryConfidence?: string;
  sku?: string;
  parentSku?: string;
  variationTheme?: string;
  color?: string;
  size?: string;
  amazonTitle?: string;
  bullet1?: string;
  bullet2?: string;
  bullet3?: string;
  bullet4?: string;
  bullet5?: string;
  productDescription?: string;
  backendSearchTerms?: string;
  targetCustomer?: string;
  useCases?: string;
  mainImageNotes?: string;
  lifestyleImageNotes?: string;
  infographicImageNotes?: string;
  sizeImageNotes?: string;
  aplusModule1Headline?: string;
  aplusModule1Body?: string;
  aplusModule2Headline?: string;
  aplusModule2Body?: string;
  aplusModule3Headline?: string;
  aplusModule3Body?: string;
  adKeywordSeeds?: string;
  negativeKeywordSeeds?: string;
  suggestedCampaignStructure?: string;
  suggestedPrice?: string;
  packageWeight?: string;
  packageDimensions?: string;
  inventory?: string;
  complianceNotes?: string;
  validationStatus?: string;
  validationNotes?: string;
}

const AMAZON_LISTING_HEADERS = [
  "Product Name",
  "Source Chinese Description",
  "Image Folder",
  "Image Count",
  "Amazon Product Type",
  "Amazon Category Path",
  "Category Confidence",
  "SKU",
  "Parent SKU",
  "Variation Theme",
  "Color",
  "Size",
  "Amazon Title",
  "Bullet 1",
  "Bullet 2",
  "Bullet 3",
  "Bullet 4",
  "Bullet 5",
  "Product Description",
  "Backend Search Terms",
  "Target Customer",
  "Use Cases",
  "Main Image Notes",
  "Lifestyle Image Notes",
  "Infographic Image Notes",
  "Size Image Notes",
  "A+ Module 1 Headline",
  "A+ Module 1 Body",
  "A+ Module 2 Headline",
  "A+ Module 2 Body",
  "A+ Module 3 Headline",
  "A+ Module 3 Body",
  "Ad Keyword Seeds",
  "Negative Keyword Seeds",
  "Suggested Campaign Structure",
  "Suggested Price",
  "Package Weight",
  "Package Dimensions",
  "Inventory",
  "Compliance Notes",
  "Validation Status",
  "Validation Notes"
];

export function writeAmazonListingWorkbook(rows: AmazonListingWorkbookRow[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const values = rows.map(row => [
    row.productName,
    row.sourceChineseDescription ?? "",
    row.imageFolder ?? "",
    row.imageCount ?? "",
    row.amazonProductType ?? "",
    row.amazonCategoryPath ?? "",
    row.categoryConfidence ?? "",
    row.sku ?? "",
    row.parentSku ?? "",
    row.variationTheme ?? "",
    row.color ?? "",
    row.size ?? "",
    row.amazonTitle ?? "",
    row.bullet1 ?? "",
    row.bullet2 ?? "",
    row.bullet3 ?? "",
    row.bullet4 ?? "",
    row.bullet5 ?? "",
    row.productDescription ?? "",
    row.backendSearchTerms ?? "",
    row.targetCustomer ?? "",
    row.useCases ?? "",
    row.mainImageNotes ?? "",
    row.lifestyleImageNotes ?? "",
    row.infographicImageNotes ?? "",
    row.sizeImageNotes ?? "",
    row.aplusModule1Headline ?? "",
    row.aplusModule1Body ?? "",
    row.aplusModule2Headline ?? "",
    row.aplusModule2Body ?? "",
    row.aplusModule3Headline ?? "",
    row.aplusModule3Body ?? "",
    row.adKeywordSeeds ?? "",
    row.negativeKeywordSeeds ?? "",
    row.suggestedCampaignStructure ?? "",
    row.suggestedPrice ?? "",
    row.packageWeight ?? "",
    row.packageDimensions ?? "",
    row.inventory ?? "",
    row.complianceNotes ?? "",
    row.validationStatus ?? "",
    row.validationNotes ?? ""
  ]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([AMAZON_LISTING_HEADERS, ...values]), "Amazon Listings");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run tests/import-excel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/excel.ts tests/import-excel.test.ts
git commit -m "feat: add Amazon listing workbook writer"
```

## Task 2: Add Category-Flexible Amazon Row Builder

**Files:**
- Create: `src/import/amazon-listing.ts`
- Test: `tests/amazon-listing.test.ts`

- [ ] **Step 1: Write failing row builder tests**

Create `tests/amazon-listing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAmazonListingRows } from "../src/import/amazon-listing.js";

describe("buildAmazonListingRows", () => {
  it("builds Amazon planning rows from imported Drive products", () => {
    const rows = buildAmazonListingRows([{
      productName: "龙猫钥匙扣",
      rawChineseDescription: "手工钩织钥匙扣，适合挂包和送礼",
      imageFolderName: "龙猫钥匙扣",
      imageCount: 3,
      images: [
        { id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" },
        { id: "img2", name: "02-bag.jpg", mimeType: "image/jpeg" }
      ]
    }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productName: "龙猫钥匙扣",
      imageFolder: "龙猫钥匙扣",
      imageCount: 3,
      amazonProductType: "KEYCHAIN",
      categoryConfidence: "medium",
      validationStatus: "needs_review"
    });
    expect(rows[0].amazonTitle).toContain("Crochet");
    expect(rows[0].bullet1).toContain("bag");
    expect(rows[0].mainImageNotes).toContain("01-main.jpg");
    expect(rows[0].suggestedCampaignStructure).toContain("Auto discovery campaign");
  });

  it("keeps uncertain categories review-gated instead of guessing silently", () => {
    const rows = buildAmazonListingRows([{
      productName: "未知产品",
      rawChineseDescription: "特殊材质新产品",
      imageFolderName: null,
      imageCount: 0,
      images: []
    }]);
    expect(rows[0]).toMatchObject({
      amazonProductType: "",
      amazonCategoryPath: "",
      categoryConfidence: "low",
      validationStatus: "needs_review"
    });
    expect(rows[0].validationNotes).toBe("Review Amazon category/product type before submission.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run tests/amazon-listing.test.ts
```

Expected: FAIL because `src/import/amazon-listing.ts` does not exist.

- [ ] **Step 3: Implement the row builder**

Create `src/import/amazon-listing.ts`:

```ts
import type { AmazonListingWorkbookRow } from "./excel.js";

type ImportedDriveProduct = {
  productName: string;
  rawChineseDescription: string;
  imageFolderName: string | null;
  imageCount: number;
  images: Array<{ id: string; name: string; mimeType: string }>;
};

function slugSku(productName: string): string {
  const normalized = productName.normalize("NFKD").replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "");
  const base = normalized || "PRODUCT";
  return `AMZ-${base.slice(0, 32).toUpperCase()}`;
}

function inferCategory(productName: string, description: string) {
  const text = `${productName} ${description}`.toLowerCase();
  if (text.includes("keychain") || text.includes("钥匙扣") || text.includes("挂包")) {
    return {
      amazonProductType: "KEYCHAIN",
      amazonCategoryPath: "Clothing, Shoes & Jewelry > Luggage & Travel Gear > Keychains",
      categoryConfidence: "medium"
    };
  }
  if (text.includes("plush") || text.includes("玩偶") || text.includes("amigurumi")) {
    return {
      amazonProductType: "TOY_FIGURE",
      amazonCategoryPath: "Toys & Games > Stuffed Animals & Plush Toys",
      categoryConfidence: "low"
    };
  }
  if (text.includes("ornament") || text.includes("挂件") || text.includes("holiday")) {
    return {
      amazonProductType: "HANGING_ORNAMENT",
      amazonCategoryPath: "Home & Kitchen > Home Decor Products > Hanging Ornaments",
      categoryConfidence: "low"
    };
  }
  return { amazonProductType: "", amazonCategoryPath: "", categoryConfidence: "low" };
}

function titleFor(category: ReturnType<typeof inferCategory>, productName: string): string {
  if (category.amazonProductType === "KEYCHAIN") return "Crochet Bag Charm Keychain, Handmade Mini Gift Accessory";
  if (category.amazonProductType === "TOY_FIGURE") return "Crochet Plush Collectible, Handmade Small Desk Decor Gift";
  if (category.amazonProductType === "HANGING_ORNAMENT") return "Crochet Hanging Ornament, Handmade Gift Decor Accent";
  return `${productName} Amazon Listing Draft`;
}

export function buildAmazonListingRows(products: ImportedDriveProduct[]): AmazonListingWorkbookRow[] {
  return products.map(product => {
    const category = inferCategory(product.productName, product.rawChineseDescription);
    const mainImageName = product.images[0]?.name;
    return {
      productName: product.productName,
      sourceChineseDescription: product.rawChineseDescription,
      imageFolder: product.imageFolderName ?? "",
      imageCount: product.imageCount,
      amazonProductType: category.amazonProductType,
      amazonCategoryPath: category.amazonCategoryPath,
      categoryConfidence: category.categoryConfidence,
      sku: slugSku(product.productName),
      parentSku: "",
      variationTheme: "",
      color: "",
      size: "",
      amazonTitle: titleFor(category, product.productName),
      bullet1: "Handmade crochet item designed for bags, keys, shelves, desks, gifting, and everyday display.",
      bullet2: "Soft textured yarn construction gives each piece a warm handmade look.",
      bullet3: "Compact size makes it easy to use as a small accessory, favor, or decorative accent.",
      bullet4: "Gift-ready option for birthdays, holidays, celebrations, party favors, and thank-you gifts.",
      bullet5: "Each item may have small handmade variations in shape, color placement, and detail.",
      productDescription: "Amazon-ready draft copy for review. Use the source product description and images to finalize category-specific details, materials, size, package dimensions, and compliance notes before submission.",
      backendSearchTerms: "crochet gift handmade charm accessory decor birthday holiday favor",
      targetCustomer: "Gift buyers, accessory shoppers, decor shoppers, and handmade-style product buyers",
      useCases: "Gift; bag charm; keychain; shelf decor; desk decor; party favor",
      mainImageNotes: mainImageName ? `Review ${mainImageName} as the main image candidate; create a clean product-focused image if needed.` : "Add a clear product-focused main image before Amazon submission.",
      lifestyleImageNotes: "Show real use context such as bag, keys, backpack, shelf, desk, gift packaging, or seasonal decor.",
      infographicImageNotes: "Create callouts for material, handmade texture, use case, giftability, care, and product details.",
      sizeImageNotes: "Add a size reference or dimensions graphic before Amazon submission.",
      aplusModule1Headline: "Small Handmade-Style Accent",
      aplusModule1Body: "Use this module to explain texture, detail, and everyday use.",
      aplusModule2Headline: "Made For Gifting",
      aplusModule2Body: "Use this module to position the product for holidays, birthdays, favors, and small thank-you gifts.",
      aplusModule3Headline: "Flexible Display And Carry",
      aplusModule3Body: "Use this module to show how the product works across bags, keys, shelves, desks, and decor moments.",
      adKeywordSeeds: "crochet gift, handmade gift, cute keychain, bag charm, desk decor, small gift",
      negativeKeywordSeeds: "digital, pattern, tutorial, wholesale, free",
      suggestedCampaignStructure: "Auto discovery campaign; Manual exact campaign for high-intent terms; Manual phrase campaign for discovery terms; Product targeting campaign after ASIN/category research",
      suggestedPrice: "",
      packageWeight: "",
      packageDimensions: "",
      inventory: "",
      complianceNotes: "Review Amazon product type, restricted products, age grading, choking hazard, material claims, and category-specific requirements before submission.",
      validationStatus: "needs_review",
      validationNotes: "Review Amazon category/product type before submission."
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run tests/amazon-listing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/amazon-listing.ts tests/amazon-listing.test.ts
git commit -m "feat: build Amazon workbook rows"
```

## Task 3: Add Drive Workbook Write Method

**Files:**
- Modify: `src/import/drive-import.ts`
- Test: `tests/import-tools.test.ts`

- [ ] **Step 1: Write the failing service test**

Append to the `DriveImportService` describe block in `tests/import-tools.test.ts`:

```ts
  it("writes Amazon listing workbook bytes back to Drive", async () => {
    const drive = {
      uploadFile: vi.fn().mockResolvedValue({ id: "amazon", name: "Product Information - Amazon Listing.xlsx" })
    };
    const service = new DriveImportService(drive as never);
    await expect(service.writeAmazonListingWorkbook("folder", [{
      productName: "产品一",
      sourceChineseDescription: "描述",
      imageFolder: "产品一",
      imageCount: 1,
      amazonProductType: "KEYCHAIN",
      validationStatus: "needs_review",
      validationNotes: "Review Amazon category/product type before submission."
    }])).resolves.toMatchObject({ id: "amazon", name: "Product Information - Amazon Listing.xlsx" });
    expect(drive.uploadFile).toHaveBeenCalledWith(
      "folder",
      "Product Information - Amazon Listing.xlsx",
      expect.any(Uint8Array),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run tests/import-tools.test.ts
```

Expected: FAIL because `writeAmazonListingWorkbook` is not a `DriveImportService` method.

- [ ] **Step 3: Implement the Drive write method**

Modify the import in `src/import/drive-import.ts`:

```ts
import { parseProductInformationWorkbook, writeAmazonListingWorkbook, writeEnrichedWorkbook, type AmazonListingWorkbookRow, type EnrichedWorkbookRow } from "./excel.js";
```

Add this method inside `DriveImportService`:

```ts
  async writeAmazonListingWorkbook(folderId: string, rows: AmazonListingWorkbookRow[]) {
    const bytes = writeAmazonListingWorkbook(rows);
    return this.drive.uploadFile(folderId, "Product Information - Amazon Listing.xlsx", bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run tests/import-tools.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/drive-import.ts tests/import-tools.test.ts
git commit -m "feat: write Amazon workbook to Drive"
```

## Task 4: Register Amazon Workbook Tool

**Files:**
- Modify: `src/tools/import-tools.ts`
- Modify: `scripts/check-forbidden-tools.mjs`
- Test: `tests/import-tools.test.ts`
- Test: `tests/mcp-integration.test.ts`

- [ ] **Step 1: Write failing tool tests**

Modify the existing import in `tests/import-tools.test.ts`:

```ts
import { previewAmazonListingWorkbookWrite, previewDraftInputFromEnrichedRow } from "../src/tools/import-tools.js";
```

Append this describe block:

```ts
describe("previewAmazonListingWorkbookWrite", () => {
  it("previews Amazon workbook generation without writing", () => {
    expect(previewAmazonListingWorkbookWrite("folder", 38)).toEqual({
      operation: "write_amazon_listing_workbook",
      folderId: "folder",
      rowCount: 38,
      filename: "Product Information - Amazon Listing.xlsx",
      warning: "This writes an Amazon planning workbook only. It does not call Amazon APIs, submit listings, upload images, create A+ Content, or change ads."
    });
  });
});
```

Add this expectation to the MCP tool list test in `tests/mcp-integration.test.ts`:

```ts
"shopweaver_write_amazon_listing_workbook",
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/import-tools.test.ts tests/mcp-integration.test.ts
```

Expected: FAIL because the preview helper and MCP tool do not exist.

- [ ] **Step 3: Add the preview helper and MCP tool**

Modify `src/tools/import-tools.ts`:

```ts
import { buildAmazonListingRows } from "../import/amazon-listing.js";
```

Add this helper above `registerImportTools`:

```ts
export function previewAmazonListingWorkbookWrite(folderId: string, rowCount: number) {
  return {
    operation: "write_amazon_listing_workbook" as const,
    folderId,
    rowCount,
    filename: "Product Information - Amazon Listing.xlsx",
    warning: "This writes an Amazon planning workbook only. It does not call Amazon APIs, submit listings, upload images, create A+ Content, or change ads."
  };
}
```

Add this tool inside `registerImportTools`:

```ts
  server.registerTool("shopweaver_write_amazon_listing_workbook", {
    description: "Create or update Product Information - Amazon Listing.xlsx in an allowed Google Drive folder. This is a workbook-only planning step and does not call Amazon APIs.",
    inputSchema: {
      mode: z.enum(["preview", "confirm"]).default("preview"),
      folderId: z.string().min(1)
    }
  }, async ({ mode, folderId }) => {
    const imported = await imports.importFolder(folderId);
    if (mode === "preview") return result(previewAmazonListingWorkbookWrite(folderId, imported.products.length));
    const rows = buildAmazonListingRows(imported.products);
    const written = await imports.writeAmazonListingWorkbook(folderId, rows);
    return result({
      operation: "write_amazon_listing_workbook",
      folderId,
      rowCount: rows.length,
      filename: "Product Information - Amazon Listing.xlsx",
      file: written,
      warning: "Workbook written only. No Amazon API, image, A+ Content, advertising, order, shipment, refund, or buyer-data action was performed."
    });
  });
```

- [ ] **Step 4: Update the tool allowlist**

Add to `allowed` in `scripts/check-forbidden-tools.mjs`:

```js
"shopweaver_write_amazon_listing_workbook",
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/import-tools.test.ts tests/mcp-integration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run safety check**

Run:

```bash
npm run check:safety
```

Expected: PASS with `ShopWeaver tool allowlist verified.`

- [ ] **Step 7: Commit**

```bash
git add src/tools/import-tools.ts scripts/check-forbidden-tools.mjs tests/import-tools.test.ts tests/mcp-integration.test.ts
git commit -m "feat: expose Amazon workbook generation tool"
```

## Task 5: Add End-to-End Service Coverage

**Files:**
- Test: `tests/import-tools.test.ts`

- [ ] **Step 1: Add confirm-mode integration-style test**

Append to `tests/import-tools.test.ts`:

```ts
describe("Amazon workbook generation flow", () => {
  it("imports Drive products, builds Amazon rows, and writes the workbook", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["龙猫钥匙扣", "", "手工钩织钥匙扣，适合挂包和送礼"]]), "Sheet1");
    const sourceBytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
    const drive = {
      listFolderChildren: vi.fn().mockResolvedValue([
        { id: "xlsx", name: "Product Information.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { id: "images", name: "Images", mimeType: "application/vnd.google-apps.folder" }
      ]),
      listChildrenByParentId: vi.fn()
        .mockResolvedValueOnce([{ id: "p1", name: "龙猫钥匙扣", mimeType: "application/vnd.google-apps.folder" }])
        .mockResolvedValueOnce([{ id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" }]),
      downloadFile: vi.fn().mockResolvedValue(sourceBytes),
      uploadFile: vi.fn().mockResolvedValue({ id: "amazon", name: "Product Information - Amazon Listing.xlsx" })
    };
    const service = new DriveImportService(drive as never);
    const imported = await service.importFolder("folder");
    const { buildAmazonListingRows } = await import("../src/import/amazon-listing.js");
    const rows = buildAmazonListingRows(imported.products);
    const written = await service.writeAmazonListingWorkbook("folder", rows);
    expect(written).toEqual({ id: "amazon", name: "Product Information - Amazon Listing.xlsx" });
    expect(rows[0]).toMatchObject({
      productName: "龙猫钥匙扣",
      amazonProductType: "KEYCHAIN",
      validationStatus: "needs_review"
    });
    expect(drive.uploadFile).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the integration-style test file**

Run:

```bash
npx vitest run tests/import-tools.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/import-tools.test.ts
git commit -m "test: cover Amazon workbook generation flow"
```

## Task 6: Verify No Amazon Write Surface Exists

**Files:**
- Existing verification only.

- [ ] **Step 1: Search for accidental Amazon API surfaces**

Run:

```bash
rg -n "amazon_submit|amazon_preview|SP-API|Selling Partner|ads|campaign|budget|bid|buyer|refund|shipment|customer-message|create_ad|submit_listing" src tests scripts docs/superpowers/plans/2026-07-26-amazon-listing-optimization.md
```

Expected: Only planning text or workbook field names appear. No source file should register an Amazon API write tool or create Amazon credentials.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
```

Expected: build, tests, and tool allowlist all pass.

- [ ] **Step 3: Commit verification fixes**

Run this only when Step 2 required source, test, or allowlist corrections:

```bash
git add src tests scripts
git commit -m "chore: verify Amazon workbook workflow"
```

## Self-Review Checklist

- [ ] Phase 1 produces only `Product Information - Amazon Listing.xlsx`.
- [ ] The implementation reuses existing approved Google Drive folder import.
- [ ] Category/product-type uncertainty is represented with `Category Confidence`, `Validation Status`, and `Validation Notes`.
- [ ] Crochet products are supported, but the model does not assume all products are handmade.
- [ ] No Amazon credentials, Amazon API clients, listing writes, image uploads, A+ Content writes, or Ads writes were added.
- [ ] `npm run verify` passes.
