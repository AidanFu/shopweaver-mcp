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

export type DriveVariationImageUploadInput = {
  listingId: number;
  folderId: string;
  variantImageFolders: string[];
  maxImagesPerVariant?: number;
};

type PlannedImage = {
  driveFileId: string;
  filename: string;
  mimeType: string;
  rank: number;
  variantImageFolder?: string;
};

type UploadPlan = {
  listingId: number;
  folderId: string;
  productName?: string;
  variantImageFolders?: string[];
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

  private async buildVariationPlan(input: DriveVariationImageUploadInput): Promise<{ plan: UploadPlan; unsupportedFiles: Array<{ fileName: string; mimeType: string; variantImageFolder: string }> }> {
    if (await this.listings.getListingState(input.listingId) !== "draft") {
      throw new ShopWeaverError("DRAFT_REQUIRED", "Images can be uploaded only to Etsy drafts.");
    }
    const rootChildren = await this.drive.listFolderChildren(input.folderId);
    const imagesRoot = rootChildren.find(file => file.name === "Images" && file.mimeType === FOLDER_TYPE);
    if (!imagesRoot) throw new ShopWeaverError("DRIVE_IMAGES_FOLDER_MISSING", "Allowed Drive folder must contain Images folder.");
    const productFolders = await this.drive.listChildrenByParentId(imagesRoot.id);
    const images: PlannedImage[] = [];
    const unsupportedFiles: Array<{ fileName: string; mimeType: string; variantImageFolder: string }> = [];
    for (const variantImageFolder of input.variantImageFolders) {
      const productFolder = productFolders.find(file => file.name === variantImageFolder && file.mimeType === FOLDER_TYPE);
      if (!productFolder) throw new ShopWeaverError("DRIVE_PRODUCT_IMAGES_MISSING", "Images folder must contain a product folder matching the product name.");
      const files = await this.drive.listChildrenByParentId(productFolder.id);
      unsupportedFiles.push(...files
        .filter(file => !IMAGE_TYPES.has(file.mimeType))
        .map(file => ({ fileName: file.name, mimeType: file.mimeType, variantImageFolder })));
      const supportedFiles = files
        .filter(file => IMAGE_TYPES.has(file.mimeType))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, input.maxImagesPerVariant);
      if (supportedFiles.length === 0) throw new ShopWeaverError("DRIVE_PRODUCT_IMAGES_MISSING", "Product image folder must contain at least one supported image.");
      images.push(...supportedFiles.map((file, index) => ({
        driveFileId: file.id,
        filename: file.name,
        mimeType: file.mimeType,
        rank: images.length + index + 1,
        variantImageFolder
      })));
    }
    if (images.length === 0) throw new ShopWeaverError("DRIVE_PRODUCT_IMAGES_MISSING", "Product image folder must contain at least one supported image.");
    return {
      plan: { listingId: input.listingId, folderId: input.folderId, variantImageFolders: input.variantImageFolders, images },
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

  async previewVariationUpload(input: DriveVariationImageUploadInput) {
    const shopId = await this.shopId();
    const { plan, unsupportedFiles } = await this.buildVariationPlan(input);
    const confirmation = this.confirmations.issue("upload_drive_variation_images", shopId, plan, input.listingId);
    return {
      operation: "upload_drive_variation_images" as const,
      shopId,
      listingId: input.listingId,
      variantImageFolders: input.variantImageFolders,
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
    const uploaded = await this.uploadPlan(shopId, input.listingId, plan);
    return { listingId: input.listingId, uploadedCount: uploaded.length, uploaded };
  }

  async confirmVariationUpload(input: DriveVariationImageUploadInput, confirmationToken: string) {
    const shopId = await this.shopId();
    const { plan } = await this.buildVariationPlan(input);
    this.confirmations.consume(confirmationToken, "upload_drive_variation_images", shopId, plan, input.listingId);
    const uploaded = await this.uploadPlan(shopId, input.listingId, plan);
    return { listingId: input.listingId, uploadedCount: uploaded.length, uploaded };
  }

  private async uploadPlan(shopId: number, listingId: number, plan: UploadPlan) {
    const uploaded = [];
    for (const image of plan.images) {
      const bytes = await this.drive.downloadFile(image.driveFileId);
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ShopWeaverError("IMAGE_TOO_LARGE", "Image exceeds the 10 MB upload limit.");
      const fileBytes = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(fileBytes).set(bytes);
      const form = new FormData();
      form.set("image", new Blob([fileBytes], { type: image.mimeType }), image.filename);
      form.set("rank", String(image.rank));
      const result = await this.client.request(`/application/shops/${shopId}/listings/${listingId}/images`, { method: "POST", body: form }, ListingImageSchema);
      uploaded.push({
        listingImageId: result.listing_image_id,
        rank: result.rank,
        width: result.full_width,
        height: result.full_height,
        url: result.url_fullxfull ?? null
      });
    }
    return uploaded;
  }
}
