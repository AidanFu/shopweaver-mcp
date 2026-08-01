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
    listChildrenByParentId: vi.fn(async (parentId: string) => {
      if (parentId === "images-root") return [{ id: "product-folder", name: "产品一", mimeType: "application/vnd.google-apps.folder" }];
      if (parentId === "product-folder") return [
        { id: "img-b", name: "02-side.jpg", mimeType: "image/jpeg" },
        { id: "notes", name: "notes.txt", mimeType: "text/plain" },
        { id: "img-a", name: "01-main.jpg", mimeType: "image/jpeg" }
      ];
      return [];
    }),
    downloadFile: vi.fn()
  };
  const listings = { getListingState: vi.fn().mockResolvedValue(listingState) };
  const client = { request: vi.fn() };
  const service = new DriveImageUploadService(client as never, listings as never, drive as never, store, new ConfirmationStore());
  return { service, drive, listings, client };
}

function mockVariantFolders(drive: Awaited<ReturnType<typeof dependencies>>["drive"], filesByFolder: Record<string, Array<{ id: string; name: string; mimeType: string }>>) {
  const folders = Object.keys(filesByFolder).map((name, index) => ({ id: `variant-${index}`, name, mimeType: "application/vnd.google-apps.folder" }));
  drive.listFolderChildren = vi.fn().mockResolvedValue([
    { id: "images", name: "Images", mimeType: "application/vnd.google-apps.folder" }
  ]);
  drive.listChildrenByParentId = vi.fn(async (parentId: string) => {
    if (parentId === "images") return folders;
    const folder = folders.find(candidate => candidate.id === parentId);
    return folder ? filesByFolder[folder.name] : [];
  });
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

  it("previews grouped variant image uploads in rank order", async () => {
    const { service, drive } = await dependencies();
    mockVariantFolders(drive, {
      "郁金香兔-紫色": [{ id: "p1", name: "01.jpg", mimeType: "image/jpeg" }],
      "郁金香兔-蓝色": [{ id: "b1", name: "01.jpg", mimeType: "image/jpeg" }]
    });
    const preview = await service.previewVariationUpload({
      listingId: 9,
      folderId: "folder",
      variantImageFolders: ["郁金香兔-紫色", "郁金香兔-蓝色"]
    });
    expect(preview.images.map(image => image.rank)).toEqual([1, 2]);
    expect(preview.images.map(image => image.variantImageFolder)).toEqual(["郁金香兔-紫色", "郁金香兔-蓝色"]);
  });

  it("uploads grouped variant images only after matching confirmation", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    const { service, drive, client } = await dependencies();
    mockVariantFolders(drive, {
      "郁金香兔-紫色": [
        { id: "p2", name: "02.jpg", mimeType: "image/jpeg" },
        { id: "p1", name: "01.jpg", mimeType: "image/jpeg" }
      ],
      "郁金香兔-蓝色": [{ id: "b1", name: "01.jpg", mimeType: "image/jpeg" }]
    });
    drive.downloadFile.mockResolvedValue(jpeg);
    client.request
      .mockResolvedValueOnce({ listing_image_id: 201, rank: 1, full_width: 1000, full_height: 1000, url_fullxfull: "https://img/p1.jpg" })
      .mockResolvedValueOnce({ listing_image_id: 202, rank: 2, full_width: 900, full_height: 900, url_fullxfull: "https://img/p2.jpg" })
      .mockResolvedValueOnce({ listing_image_id: 203, rank: 3, full_width: 800, full_height: 800, url_fullxfull: "https://img/b1.jpg" });
    const input = {
      listingId: 9,
      folderId: "folder",
      variantImageFolders: ["郁金香兔-紫色", "郁金香兔-蓝色"]
    };
    const preview = await service.previewVariationUpload(input);
    const result = await service.confirmVariationUpload(input, preview.confirmationToken);
    expect(result.uploadedCount).toBe(3);
    expect(result.uploaded.map(image => image.listingImageId)).toEqual([201, 202, 203]);
    expect(drive.downloadFile).toHaveBeenNthCalledWith(1, "p1");
    expect(drive.downloadFile).toHaveBeenNthCalledWith(2, "p2");
    expect(drive.downloadFile).toHaveBeenNthCalledWith(3, "b1");
    expect(client.request).toHaveBeenCalledTimes(3);
    expect(client.request.mock.calls.map(call => call[0])).toEqual([
      "/application/shops/42/listings/9/images",
      "/application/shops/42/listings/9/images",
      "/application/shops/42/listings/9/images"
    ]);
  });

  it("rejects non-draft listings before grouped Drive image upload confirmation", async () => {
    const { service, drive, listings, client } = await dependencies();
    mockVariantFolders(drive, {
      "郁金香兔-紫色": [{ id: "p1", name: "01.jpg", mimeType: "image/jpeg" }]
    });
    listings.getListingState.mockResolvedValueOnce("draft").mockResolvedValueOnce("active");
    const input = {
      listingId: 9,
      folderId: "folder",
      variantImageFolders: ["郁金香兔-紫色"]
    };
    const preview = await service.previewVariationUpload(input);
    await expect(service.confirmVariationUpload(input, preview.confirmationToken)).rejects.toMatchObject({ code: "DRAFT_REQUIRED" });
    expect(drive.downloadFile).not.toHaveBeenCalled();
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rejects grouped confirmation when maxImagesPerVariant changes after preview", async () => {
    const { service, drive, client } = await dependencies();
    mockVariantFolders(drive, {
      "郁金香兔-紫色": [
        { id: "p1", name: "01.jpg", mimeType: "image/jpeg" },
        { id: "p2", name: "02.jpg", mimeType: "image/jpeg" }
      ]
    });
    const preview = await service.previewVariationUpload({
      listingId: 9,
      folderId: "folder",
      variantImageFolders: ["郁金香兔-紫色"],
      maxImagesPerVariant: 1
    });
    await expect(service.confirmVariationUpload({
      listingId: 9,
      folderId: "folder",
      variantImageFolders: ["郁金香兔-紫色"]
    }, preview.confirmationToken)).rejects.toMatchObject({ code: "PREVIEW_MISMATCH" });
    expect(drive.downloadFile).not.toHaveBeenCalled();
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rejects grouped variant folders without supported images", async () => {
    const { service, drive } = await dependencies();
    mockVariantFolders(drive, {
      "郁金香兔-紫色": [{ id: "notes", name: "notes.txt", mimeType: "text/plain" }],
      "郁金香兔-蓝色": [{ id: "b1", name: "01.jpg", mimeType: "image/jpeg" }]
    });
    await expect(service.previewVariationUpload({
      listingId: 9,
      folderId: "folder",
      variantImageFolders: ["郁金香兔-紫色", "郁金香兔-蓝色"]
    })).rejects.toMatchObject({ code: "DRIVE_PRODUCT_IMAGES_MISSING" });
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
});
