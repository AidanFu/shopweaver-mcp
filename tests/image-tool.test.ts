import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { DraftWriteService } from "../src/tools/write-tools.js";
import { ConfirmationStore } from "../src/writes/confirmations.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))));

async function imagePath() {
  const directory = await mkdtemp(join(tmpdir(), "shopweaver-image-"));
  directories.push(directory);
  const path = join(directory, "product.png");
  await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]));
  return path;
}

async function service() {
  const store = new MemoryCredentialStore();
  await store.set("shop", { userId: 1, shopId: 42 });
  const client = { request: vi.fn().mockResolvedValue({ listing_image_id: 88, rank: 1, full_width: 100, full_height: 80, url_fullxfull: "https://example.test/image.png" }) };
  const listings = { getListingState: vi.fn().mockResolvedValue("draft") };
  return { client, listings, writes: new DraftWriteService(client as never, listings as never, store, new ConfirmationStore()) };
}

describe("draft image uploads", () => {
  it("previews an absolute supported image without uploading", async () => {
    const path = await imagePath();
    const { writes, client } = await service();
    const preview = await writes.previewImage(9, path, 1);
    expect(preview.file).toMatchObject({ filename: "product.png", mediaType: "image/png" });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rejects changed bytes before confirmed upload", async () => {
    const path = await imagePath();
    const { writes, client } = await service();
    const preview = await writes.previewImage(9, path, 1);
    await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]));
    await expect(writes.confirmImage(9, path, 1, preview.confirmationToken)).rejects.toMatchObject({ code: "PREVIEW_MISMATCH" });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rechecks draft state and uploads once", async () => {
    const path = await imagePath();
    const { writes, client, listings } = await service();
    const preview = await writes.previewImage(9, path, 1);
    const result = await writes.confirmImage(9, path, 1, preview.confirmationToken);
    expect(listings.getListingState).toHaveBeenCalledTimes(2);
    expect(client.request).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ listingImageId: 88, width: 100, height: 80 });
  });
});
