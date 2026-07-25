import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { LocalConfigStore } from "../src/local-config.js";

describe("LocalConfigStore", () => {
  it("starts empty when config file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-config-"));
    const store = new LocalConfigStore(join(dir, "config.local.json"));
    await expect(store.listAllowedDriveFolders()).resolves.toEqual([]);
  });

  it("adds, lists, and removes allowed Drive folders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "shopweaver-config-"));
    const path = join(dir, "config.local.json");
    const store = new LocalConfigStore(path);
    await store.addAllowedDriveFolder({ id: "folder-1", name: "HandMade" });
    await store.addAllowedDriveFolder({ id: "folder-1", name: "HandMade Updated" });
    expect(await store.listAllowedDriveFolders()).toEqual([{ id: "folder-1", name: "HandMade Updated", addedAt: expect.any(String) }]);
    await store.removeAllowedDriveFolder("folder-1");
    expect(await store.listAllowedDriveFolders()).toEqual([]);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ googleDrive: { allowedFolders: [] } });
  });
});
