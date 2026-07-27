import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { GoogleClient } from "../src/google/client.js";
import { GoogleDriveService } from "../src/google/drive.js";
import { parseDriveFolderId } from "../src/google/folder-id.js";
import { LocalConfigStore } from "../src/local-config.js";

async function storeWithGoogle() {
  const store = new MemoryCredentialStore();
  await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost/google" });
  await store.set("google", { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 120_000, scopes: ["https://www.googleapis.com/auth/drive"] });
  return store;
}

describe("GoogleClient", () => {
  it("sends bearer authorization and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "folder", name: "HandMade" }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new GoogleClient(await storeWithGoogle(), fetchMock);
    await expect(client.request("/drive/v3/files/folder")).resolves.toEqual({ id: "folder", name: "HandMade" });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer access");
  });

  it("does not return token values in errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "bad access" }), { status: 403 }));
    const client = new GoogleClient(await storeWithGoogle(), fetchMock);
    await expect(client.request("/drive/v3/files/folder")).rejects.toMatchObject({ code: "GOOGLE_REQUEST_FAILED" });
    await expect(client.request("/drive/v3/files/folder")).rejects.not.toThrow("access");
  });

  it("aborts Google requests that do not complete", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const client = new GoogleClient(await storeWithGoogle(), fetchMock, undefined, 10);
    const request = client.request("/drive/v3/files/folder");
    const expectation = expect(request).rejects.toMatchObject({ code: "GOOGLE_REQUEST_FAILED" });
    await vi.advanceTimersByTimeAsync(10);
    await expectation;
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});

describe("parseDriveFolderId", () => {
  it("parses folder ids from URLs or raw ids", () => {
    expect(parseDriveFolderId("https://drive.google.com/drive/folders/folder123?usp=sharing")).toBe("folder123");
    expect(parseDriveFolderId("folder123")).toBe("folder123");
  });
});

describe("GoogleDriveService", () => {
  it("adds validated allowed folders", async () => {
    const api = { request: vi.fn().mockResolvedValue({ id: "folder123", name: "HandMade", mimeType: "application/vnd.google-apps.folder" }) };
    const config = new LocalConfigStore(":memory:");
    config.addAllowedDriveFolder = vi.fn().mockResolvedValue({ id: "folder123", name: "HandMade" });
    const service = new GoogleDriveService(api as never, config);
    await expect(service.addAllowedFolder("https://drive.google.com/drive/folders/folder123")).resolves.toEqual({ id: "folder123", name: "HandMade" });
  });

  it("rejects imports from folders not explicitly allowed", async () => {
    const api = { request: vi.fn() };
    const config = new LocalConfigStore(":memory:");
    config.isDriveFolderAllowed = vi.fn().mockResolvedValue(false);
    const service = new GoogleDriveService(api as never, config);
    await expect(service.listFolderChildren("folder123")).rejects.toMatchObject({ code: "DRIVE_FOLDER_NOT_ALLOWED" });
    expect(api.request).not.toHaveBeenCalled();
  });

  it("exports Google Workspace files as requested MIME types", async () => {
    const api = { request: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer) };
    const config = new LocalConfigStore(":memory:");
    const service = new GoogleDriveService(api as never, config);
    await expect(service.exportFile("sheet123", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(api.request).toHaveBeenCalledWith("/drive/v3/files/sheet123/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("updates an existing file with the same name instead of creating a duplicate", async () => {
    const api = { request: vi.fn()
      .mockResolvedValueOnce({ files: [{ id: "existing", name: "Product Information - Etsy Draft.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] })
      .mockResolvedValueOnce({ id: "existing", name: "Product Information - Etsy Draft.xlsx" }) };
    const config = new LocalConfigStore(":memory:");
    config.isDriveFolderAllowed = vi.fn().mockResolvedValue(true);
    const service = new GoogleDriveService(api as never, config);
    await expect(service.uploadFile("folder", "Product Information - Etsy Draft.xlsx", new Uint8Array([1]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).resolves.toEqual({ id: "existing", name: "Product Information - Etsy Draft.xlsx" });
    expect(api.request.mock.calls[1][0]).toBe("/upload/drive/v3/files/existing?uploadType=multipart&fields=id,name");
    expect(api.request.mock.calls[1][1].method).toBe("PATCH");
  });
});
