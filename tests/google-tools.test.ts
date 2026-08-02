import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { GoogleDriveHealthService } from "../src/google/status.js";
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

  it("reports enhanced Google status through the health service", async () => {
    const store = new MemoryCredentialStore();
    const health = {
      status: vi.fn().mockResolvedValue({
        provider: "google_drive",
        connected: true,
        credentialsAvailable: true,
        authorized: true,
        accessTokenStatus: "valid",
        refreshStatus: "not_needed",
        expiresAt: "2026-08-01T00:00:00.000Z",
        scopes: ["scope"],
        nextAction: null,
        allowedFolders: [{ id: "folder", name: "HandMade" }]
      })
    };
    await expect(googleConnectionStatus(store, health as Pick<GoogleDriveHealthService, "status">, { validateRefresh: true })).resolves.toMatchObject({
      connected: true,
      refreshStatus: "not_needed",
      allowedFolders: [{ id: "folder", name: "HandMade" }]
    });
    expect(health.status).toHaveBeenCalledWith({ validateRefresh: true });
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
