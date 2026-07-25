import type { DriveFile } from "../google/drive.js";
import type { RawProductRecord } from "./excel.js";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const FOLDER_TYPE = "application/vnd.google-apps.folder";

export interface MatchedProduct extends RawProductRecord {
  imageFolderId: string | null;
  imageFolderName: string | null;
  images: DriveFile[];
  mainImage: DriveFile | null;
}

export function matchProductsToImages(rawProducts: RawProductRecord[], imageFolders: DriveFile[], imageFilesByFolderId: Map<string, DriveFile[]>) {
  const foldersByName = new Map(imageFolders.filter(folder => folder.mimeType === FOLDER_TYPE).map(folder => [folder.name, folder]));
  const matchedFolderNames = new Set<string>();
  const unsupportedFiles: Array<{ productName: string; fileName: string; mimeType: string }> = [];
  const products: MatchedProduct[] = rawProducts.map(product => {
    const folder = foldersByName.get(product.productName) ?? null;
    if (!folder) return { ...product, imageFolderId: null, imageFolderName: null, images: [], mainImage: null };
    matchedFolderNames.add(folder.name);
    const supported = [];
    for (const file of imageFilesByFolderId.get(folder.id) ?? []) {
      if (IMAGE_TYPES.has(file.mimeType)) supported.push(file);
      else unsupportedFiles.push({ productName: product.productName, fileName: file.name, mimeType: file.mimeType });
    }
    const images = supported.sort((a, b) => a.name.localeCompare(b.name));
    return { ...product, imageFolderId: folder.id, imageFolderName: folder.name, images, mainImage: images[0] ?? null };
  });
  return {
    products,
    unmatchedProducts: products.filter(product => !product.imageFolderId).map(product => product.productName),
    unusedImageFolders: imageFolders.filter(folder => folder.mimeType === FOLDER_TYPE && !matchedFolderNames.has(folder.name)).map(folder => folder.name),
    unsupportedFiles
  };
}
