import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { GoogleFolderToolService, googleConnectionStatus } from "../src/tools/google-tools.js";

describe("Google Drive tools", () => {
  it("reports connection status without tokens", async () => {
    const store = new MemoryCredentialStore();
    await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost/google" });
    await store.set("google", { accessToken: "access", refreshToken: "refresh", expiresAt: 1, scopes: ["scope"] });
    const result = await googleConnectionStatus(store);
    expect(result).toEqual({ credentialsAvailable: true, authorized: true, scopes: ["scope"] });
    expect(JSON.stringify(result)).not.toContain("access");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("delegates allowed folder add/list/remove", async () => {
    const drive = {
      addAllowedFolder: vi.fn().mockResolvedValue({ id: "folder", name: "HandMade" }),
      listAllowedFolders: vi.fn().mockResolvedValue([{ id: "folder", name: "HandMade" }]),
      removeAllowedFolder: vi.fn().mockResolvedValue(undefined)
    };
    const service = new GoogleFolderToolService(drive as never);
    await expect(service.addAllowedFolder("folder")).resolves.toEqual({ id: "folder", name: "HandMade" });
    await expect(service.listAllowedFolders()).resolves.toHaveLength(1);
    await expect(service.removeAllowedFolder("folder")).resolves.toEqual({ removed: true });
  });
});
