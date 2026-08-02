import { describe, expect, it } from "vitest";
import { accessTokenStatus, reconnectAction, type TokenHealthStatus } from "../src/auth/token-health.js";

describe("token health helpers", () => {
  it("classifies missing, expired, expiring, and valid access tokens", () => {
    expect(accessTokenStatus(undefined, 1_000)).toBe("missing");
    expect(accessTokenStatus(999, 1_000)).toBe("expired");
    expect(accessTokenStatus(61_000, 1_000)).toBe("expiring");
    expect(accessTokenStatus(62_000, 1_000)).toBe("valid");
  });

  it("uses a stable reconnect action message", () => {
    expect(reconnectAction("Google Drive")).toBe("Run npm run google:setup to reconnect Google Drive.");
  });

  it("keeps the shared status shape token-free", () => {
    const status: TokenHealthStatus = {
      provider: "google_drive",
      connected: false,
      credentialsAvailable: true,
      authorized: false,
      accessTokenStatus: "expired",
      refreshStatus: "failed",
      expiresAt: null,
      scopes: [],
      nextAction: reconnectAction("Google Drive")
    };
    expect(JSON.stringify(status)).not.toContain("\"accessToken\":");
    expect(JSON.stringify(status)).not.toContain("\"refreshToken\":");
  });
});
