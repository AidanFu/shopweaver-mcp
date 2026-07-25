import { z } from "zod";
import { ShopWeaverError } from "../errors.js";
import type { LocalConfigStore } from "../local-config.js";
import type { GoogleClient } from "./client.js";
import { parseDriveFolderId } from "./folder-id.js";

const FileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string()
}).strip();

const FileListSchema = z.object({
  files: z.array(FileSchema)
}).strip();

export type DriveFile = z.infer<typeof FileSchema>;

export class GoogleDriveService {
  constructor(private readonly api: GoogleClient, private readonly config: LocalConfigStore) {}

  async addAllowedFolder(folderUrlOrId: string) {
    const id = parseDriveFolderId(folderUrlOrId);
    const file = FileSchema.parse(await this.api.request(`/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType`));
    if (file.mimeType !== "application/vnd.google-apps.folder") throw new ShopWeaverError("DRIVE_FOLDER_INVALID", "Google Drive ID must point to a folder.");
    return this.config.addAllowedDriveFolder({ id: file.id, name: file.name });
  }

  async listAllowedFolders() {
    return this.config.listAllowedDriveFolders();
  }

  async removeAllowedFolder(folderId: string) {
    await this.config.removeAllowedDriveFolder(folderId);
  }

  async listFolderChildren(folderId: string): Promise<DriveFile[]> {
    if (!await this.config.isDriveFolderAllowed(folderId)) throw new ShopWeaverError("DRIVE_FOLDER_NOT_ALLOWED", "Google Drive folder is not in the allowed folder list.");
    return this.listChildrenByParentId(folderId);
  }

  async listChildrenByParentId(parentId: string): Promise<DriveFile[]> {
    const query = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
    const page = FileListSchema.parse(await this.api.request(`/drive/v3/files?q=${query}&fields=files(id,name,mimeType)`));
    return page.files;
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const data = await this.api.request(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!(data instanceof ArrayBuffer)) throw new ShopWeaverError("DRIVE_DOWNLOAD_FAILED", "Google Drive file download failed.");
    return new Uint8Array(data);
  }

  async exportFile(fileId: string, mimeType: string): Promise<Uint8Array> {
    const data = await this.api.request(`/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(mimeType)}`);
    if (!(data instanceof ArrayBuffer)) throw new ShopWeaverError("DRIVE_DOWNLOAD_FAILED", "Google Drive file download failed.");
    return new Uint8Array(data);
  }

  async uploadFile(parentFolderId: string, name: string, bytes: Uint8Array, mimeType: string) {
    if (!await this.config.isDriveFolderAllowed(parentFolderId)) throw new ShopWeaverError("DRIVE_FOLDER_NOT_ALLOWED", "Google Drive folder is not in the allowed folder list.");
    const existing = (await this.listChildrenByParentId(parentFolderId)).find(file => file.name === name);
    const boundary = `shopweaver-${crypto.randomUUID()}`;
    const metadata = JSON.stringify(existing ? { name } : { name, parents: [parentFolderId] });
    const fileBytes = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(fileBytes).set(bytes);
    const body = new Blob([
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
      fileBytes,
      `\r\n--${boundary}--`
    ]);
    return this.api.request(existing ? `/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=multipart&fields=id,name` : `/upload/drive/v3/files?uploadType=multipart&fields=id,name`, {
      method: existing ? "PATCH" : "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body
    });
  }
}
