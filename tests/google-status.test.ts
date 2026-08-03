import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import type { StoredRecords } from "../src/credentials/types.js";
import { ShopWeaverError } from "../src/errors.js";
import { GoogleOAuth } from "../src/google/oauth.js";
import { GoogleDriveHealthService } from "../src/google/status.js";
import { LocalConfigStore } from "../src/local-config.js";

const NOW = 1_000_000;

function configWithFolders() {
  const config = new LocalConfigStore(":memory:");
  config.listAllowedDriveFolders = vi.fn().mockResolvedValue([
    { id: "folder-1", name: "HandMade", addedAt: "2026-01-01T00:00:00.000Z" }
  ]);
  return config;
}

async function storeWithGoogle(options: { app?: boolean; token?: Partial<StoredRecords["google"]> } = {}) {
  const store = new MemoryCredentialStore();
  if (options.app) await store.set("googleApp", { clientId: "client-id", clientSecret: "client-secret", redirectUri: "http://localhost/google" });
  if (options.token) await store.set("google", {
    accessToken: "stored-access-token",
    refreshToken: "stored-refresh-token",
    expiresAt: NOW + 120_000,
    scopes: ["https://www.googleapis.com/auth/drive"],
    ...options.token
  });
  return store;
}

describe("GoogleDriveHealthService", () => {
  it("reports missing app credentials without refreshing", async () => {
    const refresh = vi.fn();
    const service = new GoogleDriveHealthService(await storeWithGoogle(), configWithFolders(), { refresh }, () => NOW);

    await expect(service.status({ validateRefresh: true })).resolves.toMatchObject({
      provider: "google_drive",
      connected: false,
      credentialsAvailable: false,
      authorized: false,
      accessTokenStatus: "missing",
      refreshStatus: "skipped",
      nextAction: "Run npm run google:setup to connect Google Drive."
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports missing app credentials as missing even when an orphan Google token exists", async () => {
    const refresh = vi.fn();
    const service = new GoogleDriveHealthService(await storeWithGoogle({ token: { expiresAt: NOW + 120_000 } }), configWithFolders(), { refresh }, () => NOW);

    await expect(service.status({ validateRefresh: true })).resolves.toMatchObject({
      connected: false,
      credentialsAvailable: false,
      authorized: false,
      accessTokenStatus: "missing",
      refreshStatus: "skipped"
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports missing Google OAuth credentials without refreshing", async () => {
    const refresh = vi.fn();
    const service = new GoogleDriveHealthService(await storeWithGoogle({ app: true }), configWithFolders(), { refresh }, () => NOW);

    await expect(service.status({ validateRefresh: true })).resolves.toMatchObject({
      credentialsAvailable: true,
      authorized: false,
      accessTokenStatus: "missing",
      refreshStatus: "skipped"
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports valid tokens and allowed folders without leaking token values", async () => {
    const refresh = vi.fn();
    const service = new GoogleDriveHealthService(await storeWithGoogle({ app: true, token: {} }), configWithFolders(), { refresh }, () => NOW);

    const status = await service.status({ validateRefresh: true });

    expect(status).toMatchObject({
      connected: true,
      accessTokenStatus: "valid",
      refreshStatus: "not_needed",
      allowedFolders: [{ id: "folder-1", name: "HandMade" }]
    });
    expect(refresh).not.toHaveBeenCalled();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("stored-access-token");
    expect(serialized).not.toContain("stored-refresh-token");
  });

  it("skips refresh for expired tokens unless validation is requested", async () => {
    const refresh = vi.fn();
    const service = new GoogleDriveHealthService(await storeWithGoogle({ app: true, token: { expiresAt: NOW - 1 } }), configWithFolders(), { refresh }, () => NOW);

    await expect(service.status({ validateRefresh: false })).resolves.toMatchObject({
      connected: false,
      accessTokenStatus: "expired",
      refreshStatus: "skipped",
      nextAction: "Run google_drive_connection_status with validateRefresh=true or run npm run google:status."
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("skips refresh for expiring tokens unless validation is requested", async () => {
    const refresh = vi.fn();
    const service = new GoogleDriveHealthService(await storeWithGoogle({ app: true, token: { expiresAt: NOW + 1 } }), configWithFolders(), { refresh }, () => NOW);

    await expect(service.status({ validateRefresh: false })).resolves.toMatchObject({
      connected: false,
      accessTokenStatus: "expiring",
      refreshStatus: "skipped",
      nextAction: "Run google_drive_connection_status with validateRefresh=true or run npm run google:status."
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes expired tokens when validation is requested", async () => {
    const store = await storeWithGoogle({ app: true, token: { expiresAt: NOW - 1 } });
    const refresh = vi.fn().mockResolvedValue({
      accessToken: "refreshed-access-token",
      refreshToken: "stored-refresh-token",
      expiresAt: NOW + 120_000,
      scopes: ["https://www.googleapis.com/auth/drive"]
    });
    const service = new GoogleDriveHealthService(store, configWithFolders(), { refresh }, () => NOW);

    await expect(service.status({ validateRefresh: true })).resolves.toMatchObject({
      connected: true,
      accessTokenStatus: "valid",
      refreshStatus: "refreshed"
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("supports a production-style Google OAuth refresher", async () => {
    const store = await storeWithGoogle({ app: true, token: { expiresAt: NOW - 1 } });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "refreshed-access-token",
      token_type: "Bearer",
      expires_in: 120,
      scope: "https://www.googleapis.com/auth/drive"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const oauth = new GoogleOAuth(store, fetch, () => NOW);
    const service = new GoogleDriveHealthService(store, configWithFolders(), oauth, () => NOW);

    await expect(service.status({ validateRefresh: true })).resolves.toMatchObject({
      connected: true,
      accessTokenStatus: "valid",
      refreshStatus: "refreshed"
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("reports failed refresh without leaking token values", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("stored-refresh-token rejected"));
    const service = new GoogleDriveHealthService(await storeWithGoogle({ app: true, token: { expiresAt: NOW - 1 } }), configWithFolders(), { refresh }, () => NOW);

    const status = await service.status({ validateRefresh: true });

    expect(status).toMatchObject({
      connected: false,
      refreshStatus: "failed",
      nextAction: "Run npm run google:setup to reconnect Google Drive."
    });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("stored-access-token");
    expect(serialized).not.toContain("stored-refresh-token");
  });

  it("throws a reconnect error when readiness validation fails", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("revoked"));
    const service = new GoogleDriveHealthService(await storeWithGoogle({ app: true, token: { expiresAt: NOW - 1 } }), configWithFolders(), { refresh }, () => NOW);

    await expect(service.assertReady()).rejects.toEqual(new ShopWeaverError(
      "GOOGLE_AUTH_REQUIRED",
      "Google Drive authorization expired or was revoked. Run npm run google:setup to reconnect Google Drive."
    ));
  });

  it("throws a reconnect error when expiring-token readiness validation fails", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("revoked"));
    const service = new GoogleDriveHealthService(await storeWithGoogle({ app: true, token: { expiresAt: NOW + 1 } }), configWithFolders(), { refresh }, () => NOW);

    await expect(service.assertReady()).rejects.toEqual(new ShopWeaverError(
      "GOOGLE_AUTH_REQUIRED",
      "Google Drive authorization expired or was revoked. Run npm run google:setup to reconnect Google Drive."
    ));
  });
});
