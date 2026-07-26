# Drive-to-Etsy Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a draft-only tool that uploads matched product images from an explicitly allowed Google Drive folder directly into an Etsy draft listing.

**Architecture:** Add a focused `DriveImageUploadService` that composes existing `GoogleDriveService`, `ListingService`, `EtsyClient`, `CredentialStore`, and `ConfirmationStore`. It previews sorted Drive images first, then confirms by downloading image bytes in memory and uploading them to Etsy's listing image endpoint. Register one new MCP tool that exposes preview/confirm modes.

**Tech Stack:** TypeScript, Vitest, Zod, MCP SDK, Etsy Open API v3, Google Drive API, macOS Keychain-backed credentials.

---

## File structure

- Create `src/import/drive-image-upload.ts`
  - Resolve `Images/<productName>` under an allowed Drive root.
  - Preview sorted supported images.
  - Confirm exact preview token and upload binary image bytes to Etsy.
- Modify `src/server.ts`
  - Accept and register the new service dependency.
- Modify `src/index.ts`
  - Construct the new service with existing Etsy and Drive dependencies.
- Modify `scripts/check-forbidden-tools.mjs`
  - Add the new approved tool name.
- Modify `tests/mcp-integration.test.ts`
  - Expect the new MCP tool.
- Create `tests/drive-image-upload.test.ts`
  - Test preview, draft-only guard, confirmation matching, sorted rank upload, and unsupported file reporting.

---

### Task 1: Add Drive image upload service preview

**Files:**
- Create: `src/import/drive-image-upload.ts`
- Test: `tests/drive-image-upload.test.ts`

- [ ] **Step 1: Write the failing preview tests**

Create `tests/drive-image-upload.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { DriveImageUploadService } from "../src/import/drive-image-upload.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";

async function dependencies(listingState = "draft") {
  const store = new MemoryCredentialStore();
  await store.set("shop", { userId: 1, shopId: 42 });
  const drive = {
    listFolderChildren: vi.fn().mockResolvedValue([
      { id: "sheet", name: "Product Information", mimeType: "application/vnd.google-apps.spreadsheet" },
      { id: "images-root", name: "Images", mimeType: "application/vnd.google-apps.folder" }
    ]),
    listChildrenByParentId: vi.fn()
      .mockResolvedValueOnce([{ id: "product-folder", name: "产品一", mimeType: "application/vnd.google-apps.folder" }])
      .mockResolvedValueOnce([
        { id: "img-b", name: "02-side.jpg", mimeType: "image/jpeg" },
        { id: "notes", name: "notes.txt", mimeType: "text/plain" },
        { id: "img-a", name: "01-main.jpg", mimeType: "image/jpeg" }
      ]),
    downloadFile: vi.fn()
  };
  const listings = { getListingState: vi.fn().mockResolvedValue(listingState) };
  const client = { request: vi.fn() };
  const service = new DriveImageUploadService(client as never, listings as never, drive as never, store, new ConfirmationStore());
  return { service, drive, listings, client };
}

describe("DriveImageUploadService", () => {
  it("previews sorted Drive image uploads for one Etsy draft", async () => {
    const { service, client } = await dependencies();
    const preview = await service.previewUpload({
      listingId: 9,
      folderId: "root",
      productName: "产品一"
    });
    expect(preview.operation).toBe("upload_drive_images");
    expect(preview.shopId).toBe(42);
    expect(preview.listingId).toBe(9);
    expect(preview.productName).toBe("产品一");
    expect(preview.images).toEqual([
      { driveFileId: "img-a", filename: "01-main.jpg", mimeType: "image/jpeg", rank: 1 },
      { driveFileId: "img-b", filename: "02-side.jpg", mimeType: "image/jpeg", rank: 2 }
    ]);
    expect(preview.unsupportedFiles).toEqual([{ fileName: "notes.txt", mimeType: "text/plain" }]);
    expect(preview.warning).toContain("Etsy draft");
    expect(preview.confirmationToken.length).toBeGreaterThan(20);
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rejects non-draft listings before Drive image upload preview", async () => {
    const { service, drive } = await dependencies("active");
    await expect(service.previewUpload({
      listingId: 9,
      folderId: "root",
      productName: "产品一"
    })).rejects.toMatchObject({ code: "DRAFT_REQUIRED" });
    expect(drive.listFolderChildren).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/drive-image-upload.test.ts
```

Expected: FAIL because `src/import/drive-image-upload.ts` does not exist.

- [ ] **Step 3: Implement the minimal preview service**

Create `src/import/drive-image-upload.ts`:

```ts
import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import type { EtsyClient } from "../etsy/client.js";
import type { ListingService } from "../etsy/listings.js";
import { ListingImageSchema } from "../etsy/schemas.js";
import type { GoogleDriveService } from "../google/drive.js";
import type { ConfirmationStore } from "../writes/confirmations.js";

const FOLDER_TYPE = "application/vnd.google-apps.folder";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type DriveImageUploadInput = {
  listingId: number;
  folderId: string;
  productName: string;
  maxImages?: number;
};

type PlannedImage = {
  driveFileId: string;
  filename: string;
  mimeType: string;
  rank: number;
};

type UploadPlan = {
  listingId: number;
  folderId: string;
  productName: string;
  images: PlannedImage[];
};

export class DriveImageUploadService {
  constructor(
    private readonly client: EtsyClient,
    private readonly listings: ListingService,
    private readonly drive: GoogleDriveService,
    private readonly store: CredentialStore,
    private readonly confirmations: ConfirmationStore
  ) {}

  private async shopId(): Promise<number> {
    const shop = await this.store.get("shop");
    if (!shop) throw new ShopWeaverError("SHOP_NOT_CONNECTED", "Connect one Etsy shop before using write tools.");
    return shop.shopId;
  }

  private async buildPlan(input: DriveImageUploadInput): Promise<{ plan: UploadPlan; unsupportedFiles: Array<{ fileName: string; mimeType: string }> }> {
    if (await this.listings.getListingState(input.listingId) !== "draft") {
      throw new ShopWeaverError("DRAFT_REQUIRED", "Images can be uploaded only to Etsy drafts.");
    }
    const rootChildren = await this.drive.listFolderChildren(input.folderId);
    const imagesRoot = rootChildren.find(file => file.name === "Images" && file.mimeType === FOLDER_TYPE);
    if (!imagesRoot) throw new ShopWeaverError("DRIVE_IMAGES_FOLDER_MISSING", "Allowed Drive folder must contain Images folder.");
    const productFolders = await this.drive.listChildrenByParentId(imagesRoot.id);
    const productFolder = productFolders.find(file => file.name === input.productName && file.mimeType === FOLDER_TYPE);
    if (!productFolder) throw new ShopWeaverError("DRIVE_PRODUCT_IMAGES_MISSING", "Images folder must contain a product folder matching the product name.");
    const files = await this.drive.listChildrenByParentId(productFolder.id);
    const unsupportedFiles = files
      .filter(file => !IMAGE_TYPES.has(file.mimeType))
      .map(file => ({ fileName: file.name, mimeType: file.mimeType }));
    const supportedFiles = files
      .filter(file => IMAGE_TYPES.has(file.mimeType))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, input.maxImages);
    const images = supportedFiles.map((file, index) => ({
      driveFileId: file.id,
      filename: file.name,
      mimeType: file.mimeType,
      rank: index + 1
    }));
    if (images.length === 0) throw new ShopWeaverError("DRIVE_PRODUCT_IMAGES_MISSING", "Product image folder must contain at least one supported image.");
    return {
      plan: { listingId: input.listingId, folderId: input.folderId, productName: input.productName, images },
      unsupportedFiles
    };
  }

  async previewUpload(input: DriveImageUploadInput) {
    const shopId = await this.shopId();
    const { plan, unsupportedFiles } = await this.buildPlan(input);
    const confirmation = this.confirmations.issue("upload_drive_images", shopId, plan, input.listingId);
    return {
      operation: "upload_drive_images" as const,
      shopId,
      listingId: input.listingId,
      productName: input.productName,
      imageCount: plan.images.length,
      images: plan.images,
      unsupportedFiles,
      ...confirmation,
      warning: "This will upload Google Drive images only to the confirmed Etsy draft."
    };
  }

  async confirmUpload(input: DriveImageUploadInput, confirmationToken: string) {
    const shopId = await this.shopId();
    const { plan } = await this.buildPlan(input);
    this.confirmations.consume(confirmationToken, "upload_drive_images", shopId, plan, input.listingId);
    const uploaded = [];
    for (const image of plan.images) {
      const bytes = await this.drive.downloadFile(image.driveFileId);
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ShopWeaverError("IMAGE_TOO_LARGE", "Image exceeds the 10 MB upload limit.");
      const fileBytes = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(fileBytes).set(bytes);
      const form = new FormData();
      form.set("image", new Blob([fileBytes], { type: image.mimeType }), image.filename);
      form.set("rank", String(image.rank));
      const result = await this.client.request(`/application/shops/${shopId}/listings/${input.listingId}/images`, { method: "POST", body: form }, ListingImageSchema);
      uploaded.push({
        listingImageId: result.listing_image_id,
        rank: result.rank,
        width: result.full_width,
        height: result.full_height,
        url: result.url_fullxfull ?? null
      });
    }
    return { listingId: input.listingId, uploadedCount: uploaded.length, uploaded };
  }
}
```

- [ ] **Step 4: Run tests to verify preview passes**

Run:

```bash
npx vitest run tests/drive-image-upload.test.ts
```

Expected: PASS for the preview tests once Task 2 updates confirmation actions.

- [ ] **Step 5: Commit**

```bash
git add src/import/drive-image-upload.ts tests/drive-image-upload.test.ts
git commit -m "feat: preview Drive image uploads"
```

---

### Task 2: Add confirmation action support and upload tests

**Files:**
- Modify: `src/writes/confirmations.ts`
- Modify: `tests/drive-image-upload.test.ts`
- Modify: `src/import/drive-image-upload.ts`

- [ ] **Step 1: Write failing confirmation tests**

Append these tests inside the existing `describe("DriveImageUploadService", ...)` block in `tests/drive-image-upload.test.ts`:

```ts
  it("uploads sorted Drive images to Etsy only after matching confirmation", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    const { service, drive, client } = await dependencies();
    drive.downloadFile.mockResolvedValue(jpeg);
    client.request
      .mockResolvedValueOnce({ listing_image_id: 101, rank: 1, full_width: 1000, full_height: 1000, url_fullxfull: "https://img/1.jpg" })
      .mockResolvedValueOnce({ listing_image_id: 102, rank: 2, full_width: 900, full_height: 900, url_fullxfull: "https://img/2.jpg" });
    const input = { listingId: 9, folderId: "root", productName: "产品一" };
    const preview = await service.previewUpload(input);
    const result = await service.confirmUpload(input, preview.confirmationToken);
    expect(result.uploadedCount).toBe(2);
    expect(result.uploaded.map(image => image.listingImageId)).toEqual([101, 102]);
    expect(drive.downloadFile).toHaveBeenCalledWith("img-a");
    expect(drive.downloadFile).toHaveBeenCalledWith("img-b");
    expect(client.request.mock.calls[0][0]).toBe("/application/shops/42/listings/9/images");
    expect(client.request.mock.calls[0][1].method).toBe("POST");
  });

  it("rejects confirmation when maxImages changes after preview", async () => {
    const { service, client } = await dependencies();
    const preview = await service.previewUpload({ listingId: 9, folderId: "root", productName: "产品一", maxImages: 1 });
    await expect(service.confirmUpload({
      listingId: 9,
      folderId: "root",
      productName: "产品一"
    }, preview.confirmationToken)).rejects.toMatchObject({ code: "PREVIEW_MISMATCH" });
    expect(client.request).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/drive-image-upload.test.ts
```

Expected: FAIL because `upload_drive_images` is not a supported confirmation action.

- [ ] **Step 3: Add the confirmation action**

Modify `src/writes/confirmations.ts`:

```ts
export type WriteAction = "create_draft" | "update_draft" | "upload_draft_image" | "upload_drive_images" | "update_draft_inventory";
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/drive-image-upload.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/writes/confirmations.ts src/import/drive-image-upload.ts tests/drive-image-upload.test.ts
git commit -m "feat: confirm Drive image uploads"
```

---

### Task 3: Register the MCP tool

**Files:**
- Create: `src/tools/drive-image-tools.ts`
- Modify: `src/server.ts`
- Modify: `src/index.ts`
- Modify: `tests/mcp-integration.test.ts`
- Modify: `scripts/check-forbidden-tools.mjs`

- [ ] **Step 1: Write failing MCP integration expectation**

Modify `tests/mcp-integration.test.ts`:

```ts
import { DriveImageUploadService } from "../src/import/drive-image-upload.js";
```

Add a dependency before `createServer`:

```ts
const driveImageUploads = new DriveImageUploadService(clientApi, listings, {} as never, store, new ConfirmationStore());
const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads });
```

Add the tool name in the sorted expected list:

```ts
"shopweaver_upload_drive_images_to_etsy_draft",
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/mcp-integration.test.ts
```

Expected: FAIL because `driveImageUploads` is not accepted by `createServer` and the tool is not registered.

- [ ] **Step 3: Create the tool registration file**

Create `src/tools/drive-image-tools.ts`:

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DriveImageUploadService } from "../import/drive-image-upload.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

const DriveImageUploadInput = {
  mode: z.enum(["preview", "confirm"]).default("preview"),
  confirmationToken: z.string().min(20).optional(),
  listingId: z.number().int().positive(),
  folderId: z.string().min(1),
  productName: z.string().min(1),
  maxImages: z.number().int().positive().max(10).optional()
};

export function registerDriveImageTools(server: McpServer, uploads: DriveImageUploadService): void {
  server.registerTool("shopweaver_upload_drive_images_to_etsy_draft", {
    description: "Preview or confirm uploading matched Google Drive product images to one Etsy draft listing.",
    inputSchema: DriveImageUploadInput
  }, async ({ mode, confirmationToken, ...input }) => result(mode === "preview"
    ? await uploads.previewUpload(input)
    : await uploads.confirmUpload(input, confirmationToken ?? "")));
}
```

- [ ] **Step 4: Wire the server dependency**

Modify `src/server.ts`:

```ts
import type { DriveImageUploadService } from "./import/drive-image-upload.js";
import { registerDriveImageTools } from "./tools/drive-image-tools.js";
```

Add to `ServerDependencies`:

```ts
driveImageUploads?: DriveImageUploadService;
```

Add to `createServer`:

```ts
if (dependencies.driveImageUploads) registerDriveImageTools(server, dependencies.driveImageUploads);
```

- [ ] **Step 5: Wire runtime construction**

Modify `src/index.ts`:

```ts
import { DriveImageUploadService } from "./import/drive-image-upload.js";
```

Add after `driveImports`:

```ts
const driveImageUploads = new DriveImageUploadService(client, listings, googleDrive, store, new ConfirmationStore());
const server = createServer({ store, listings, orders, writes, googleFolders, driveImports, driveImageUploads });
```

- [ ] **Step 6: Update safety allowlist**

Modify `scripts/check-forbidden-tools.mjs` to include:

```js
"shopweaver_upload_drive_images_to_etsy_draft",
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npx vitest run tests/mcp-integration.test.ts tests/drive-image-upload.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/tools/drive-image-tools.ts src/server.ts src/index.ts tests/mcp-integration.test.ts scripts/check-forbidden-tools.mjs
git commit -m "feat: expose Drive image upload tool"
```

---

### Task 4: Full verification and live upload

**Files:**
- No source changes expected.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
Test Files  22 passed
ShopWeaver tool allowlist verified.
```

- [ ] **Step 2: Commit any verification-only documentation fixes**

Only if verification requires a small documentation or test expectation correction, commit it:

```bash
git status --short
git add docs/superpowers/plans/2026-07-26-drive-to-etsy-image-upload.md
git commit -m "test: update Drive image upload verification"
```

- [ ] **Step 3: Push the branch**

Run:

```bash
GIT_SSH_COMMAND='ssh -F /dev/null -o IdentitiesOnly=yes -o IdentityFile=~/.ssh/id_ed25519_shopweaver_personal' git push -u git@github.com:AidanFu/shopweaver-mcp.git codex/shopweaver-implementation
```

- [ ] **Step 4: Preview the live Drive-to-Etsy image upload**

Run a TSX snippet using the new service:

```ts
import { KeychainCredentialStore } from "./src/credentials/keychain.ts";
import { EtsyClient } from "./src/etsy/client.ts";
import { ListingService } from "./src/etsy/listings.ts";
import { GoogleClient } from "./src/google/client.ts";
import { GoogleDriveService } from "./src/google/drive.ts";
import { DriveImageUploadService } from "./src/import/drive-image-upload.ts";
import { LocalConfigStore } from "./src/local-config.ts";
import { ConfirmationStore } from "./src/writes/confirmations.ts";

const store = new KeychainCredentialStore();
const etsy = new EtsyClient({ store });
const listings = new ListingService(etsy, store);
const drive = new GoogleDriveService(new GoogleClient(store), new LocalConfigStore());
const uploads = new DriveImageUploadService(etsy, listings, drive, store, new ConfirmationStore());
const preview = await uploads.previewUpload({
  listingId: 4544312498,
  folderId: "1jGioNu6oQ5LJGq9C72NLuRrgAGxB4yAl",
  productName: "郁金香兔-紫色"
});
console.log(JSON.stringify(preview, null, 2));
```

Expected:

```text
imageCount: 7
rank 1 filename: 郁金香兔-紫色-1.jpeg
warning mentions Etsy draft
```

- [ ] **Step 5: Ask for confirmation**

Ask the user to confirm the exact upload preview before live upload:

```text
Confirm uploading these 7 Drive images to Etsy draft 4544312498?
```

- [ ] **Step 6: Confirm the live upload**

Use the confirmation token from Step 4 with:

```ts
const result = await uploads.confirmUpload({
  listingId: 4544312498,
  folderId: "1jGioNu6oQ5LJGq9C72NLuRrgAGxB4yAl",
  productName: "郁金香兔-紫色"
}, preview.confirmationToken);
console.log(JSON.stringify(result, null, 2));
```

Expected:

```text
uploadedCount: 7
all returned ranks are present
listing image IDs are returned
```

- [ ] **Step 7: Read back Etsy images**

Use a read-only Etsy API request to:

```text
/application/listings/4544312498/images
```

Expected:

```text
count >= 7
rank 1 image exists
```

- [ ] **Step 8: Report final result**

Report:

```text
Uploaded image count
Listing ID
Rank 1 image ID
Verification command result
Latest commit hash
Push status
```

---

## Self-review

- Spec coverage: covers allowed Drive folder, product image matching, in-memory transfer, Etsy draft-only upload, preview/confirmation, no publish/delete, and live verification.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: the plan consistently uses `DriveImageUploadService`, `previewUpload`, `confirmUpload`, `DriveImageUploadInput`, and `shopweaver_upload_drive_images_to_etsy_draft`.
