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
