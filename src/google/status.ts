import {
  accessTokenStatus,
  isoExpiresAt,
  reconnectAction,
  type TokenHealthStatus
} from "../auth/token-health.js";
import type { CredentialStore, StoredRecords } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import type { LocalConfigStore } from "../local-config.js";
import type { GoogleOAuth } from "./oauth.js";

type RefreshGoogleOAuth = Pick<GoogleOAuth, "refresh">;

export type GoogleDriveHealthStatus = TokenHealthStatus & {
  provider: "google_drive";
  allowedFolders: Array<{ id: string; name: string }>;
};

export class GoogleDriveHealthService {
  constructor(
    private readonly store: CredentialStore,
    private readonly config: Pick<LocalConfigStore, "listAllowedDriveFolders">,
    private readonly oauth?: RefreshGoogleOAuth,
    private readonly now: () => number = Date.now
  ) {}

  async status(options: { validateRefresh?: boolean } = {}): Promise<GoogleDriveHealthStatus> {
    const [app, google, allowedFolders] = await Promise.all([
      this.store.get("googleApp"),
      this.store.get("google"),
      this.config.listAllowedDriveFolders()
    ]);
    const folders = allowedFolders.map(({ id, name }) => ({ id, name }));
    if (!app || !google) {
      return {
        provider: "google_drive",
        connected: false,
        credentialsAvailable: app !== null,
        authorized: false,
        accessTokenStatus: "missing",
        refreshStatus: "skipped",
        expiresAt: isoExpiresAt(google?.expiresAt),
        scopes: google?.scopes ?? [],
        nextAction: app ? reconnectAction("google_drive") : "Run npm run google:setup to connect Google Drive.",
        allowedFolders: folders
      };
    }

    const initialAccessTokenStatus = accessTokenStatus(google.expiresAt, this.now());
    if (initialAccessTokenStatus === "valid") return this.buildStatus(app, google, "not_needed", folders);

    if (!options.validateRefresh) {
      return this.buildStatus(
        app,
        google,
        "skipped",
        folders,
        "Run google_drive_connection_status with validateRefresh=true or run npm run google:status."
      );
    }

    if (!this.oauth) return this.buildStatus(app, google, "not_supported", folders, reconnectAction("google_drive"));

    try {
      const refreshed = await this.oauth.refresh(app, google);
      await this.store.set("google", refreshed);
      return this.buildStatus(app, refreshed, "refreshed", folders);
    } catch {
      return this.buildStatus(app, google, "failed", folders, reconnectAction("google_drive"));
    }
  }

  async assertReady(): Promise<void> {
    const status = await this.status({ validateRefresh: true });
    if (status.connected) return;
    if (status.refreshStatus === "failed") {
      throw new ShopWeaverError(
        "GOOGLE_AUTH_REQUIRED",
        "Google Drive authorization expired or was revoked. Run npm run google:setup to reconnect Google Drive."
      );
    }
    throw new ShopWeaverError("GOOGLE_AUTH_REQUIRED", status.nextAction ?? reconnectAction("google_drive"));
  }

  private buildStatus(
    _app: StoredRecords["googleApp"],
    google: StoredRecords["google"],
    refreshStatus: GoogleDriveHealthStatus["refreshStatus"],
    allowedFolders: GoogleDriveHealthStatus["allowedFolders"],
    nextAction?: string
  ): GoogleDriveHealthStatus {
    const status = accessTokenStatus(google.expiresAt, this.now());
    const connected = status === "valid" && refreshStatus !== "failed";
    return {
      provider: "google_drive",
      connected,
      credentialsAvailable: true,
      authorized: true,
      accessTokenStatus: status,
      refreshStatus,
      expiresAt: isoExpiresAt(google.expiresAt),
      scopes: google.scopes,
      nextAction: connected ? null : nextAction ?? reconnectAction("google_drive"),
      allowedFolders
    };
  }
}
