import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const AllowedDriveFolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  addedAt: z.string().optional()
}).strip();

const LocalConfigSchema = z.object({
  googleDrive: z.object({
    allowedFolders: z.array(AllowedDriveFolderSchema).default([])
  }).default({ allowedFolders: [] })
}).default({ googleDrive: { allowedFolders: [] } });

export type AllowedDriveFolder = z.infer<typeof AllowedDriveFolderSchema>;

export class LocalConfigStore {
  constructor(private readonly path = "config.local.json") {}

  private async readConfig() {
    try {
      return LocalConfigSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return LocalConfigSchema.parse({});
      throw error;
    }
  }

  private async writeConfig(config: z.infer<typeof LocalConfigSchema>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  async listAllowedDriveFolders(): Promise<AllowedDriveFolder[]> {
    return (await this.readConfig()).googleDrive.allowedFolders;
  }

  async addAllowedDriveFolder(folder: Pick<AllowedDriveFolder, "id" | "name">): Promise<AllowedDriveFolder> {
    const config = await this.readConfig();
    const updated = { ...folder, addedAt: new Date().toISOString() };
    config.googleDrive.allowedFolders = [
      ...config.googleDrive.allowedFolders.filter(existing => existing.id !== folder.id),
      updated
    ];
    await this.writeConfig(config);
    return updated;
  }

  async removeAllowedDriveFolder(folderId: string): Promise<void> {
    const config = await this.readConfig();
    config.googleDrive.allowedFolders = config.googleDrive.allowedFolders.filter(folder => folder.id !== folderId);
    await this.writeConfig(config);
  }

  async isDriveFolderAllowed(folderId: string): Promise<boolean> {
    return (await this.listAllowedDriveFolders()).some(folder => folder.id === folderId);
  }
}
