import { ShopWeaverError } from "../errors.js";
import type { GoogleDriveService } from "../google/drive.js";
import { parseProductInformationWorkbook, writeEnrichedWorkbook, type EnrichedWorkbookRow } from "./excel.js";
import { matchProductsToImages } from "./matcher.js";

const FOLDER_TYPE = "application/vnd.google-apps.folder";

export class DriveImportService {
  constructor(private readonly drive: GoogleDriveService) {}

  async importFolder(folderId: string) {
    const rootChildren = await this.drive.listFolderChildren(folderId);
    const workbook = rootChildren.find(file => file.name === "Product Information.xlsx");
    const imagesFolder = rootChildren.find(file => file.name === "Images" && file.mimeType === FOLDER_TYPE);
    if (!workbook) throw new ShopWeaverError("DRIVE_WORKBOOK_MISSING", "Allowed Drive folder must contain Product Information.xlsx.");
    if (!imagesFolder) throw new ShopWeaverError("DRIVE_IMAGES_FOLDER_MISSING", "Allowed Drive folder must contain Images folder.");
    const rawProducts = parseProductInformationWorkbook(await this.drive.downloadFile(workbook.id));
    const imageFolders = await this.drive.listChildrenByParentId(imagesFolder.id);
    const imageFilesByFolderId = new Map();
    for (const folder of imageFolders.filter(file => file.mimeType === FOLDER_TYPE)) {
      imageFilesByFolderId.set(folder.id, await this.drive.listChildrenByParentId(folder.id));
    }
    const matched = matchProductsToImages(rawProducts, imageFolders, imageFilesByFolderId);
    return {
      products: matched.products.map(product => ({
        productName: product.productName,
        rawChineseDescription: product.rawChineseDescription,
        imageFolderId: product.imageFolderId,
        imageFolderName: product.imageFolderName,
        imageCount: product.images.length,
        mainImageName: product.mainImage?.name ?? null,
        images: product.images.map(image => ({ id: image.id, name: image.name, mimeType: image.mimeType }))
      })),
      unmatchedProducts: matched.unmatchedProducts,
      unusedImageFolders: matched.unusedImageFolders,
      unsupportedFiles: matched.unsupportedFiles
    };
  }

  async writeEnrichedWorkbook(folderId: string, rows: EnrichedWorkbookRow[]) {
    const bytes = writeEnrichedWorkbook(rows);
    return this.drive.uploadFile(folderId, "Product Information - Etsy Draft.xlsx", bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
}
