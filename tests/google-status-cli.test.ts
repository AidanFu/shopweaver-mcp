import { describe, expect, it, vi } from "vitest";
import { runGoogleStatusCli } from "../src/google-status.js";
import { registerSecret } from "../src/redaction.js";

describe("google status CLI", () => {
  it("prints JSON and exits zero when connected", async () => {
    const stdout: string[] = [];
    const exitCode = await runGoogleStatusCli({
      health: { status: vi.fn().mockResolvedValue({ connected: true, provider: "google_drive" }) } as never,
      stdout: { write: (value: string) => { stdout.push(value); return true; } } as never
    });
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ connected: true, provider: "google_drive" });
  });

  it("returns one when disconnected and does not print secrets", async () => {
    registerSecret("raw-secret");
    const stdout: string[] = [];
    const exitCode = await runGoogleStatusCli({
      health: { status: vi.fn().mockResolvedValue({
        connected: false,
        accessTokenStatus: "expired",
        nextAction: "Run npm run google:setup to reconnect Google Drive.",
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        clientSecret: "client-secret",
        error: "failed because raw-secret was revoked"
      }) } as never,
      stdout: { write: (value: string) => { stdout.push(value); return true; } } as never
    });
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.join(""))).toMatchObject({ accessTokenStatus: "expired" });
    expect(stdout.join("")).not.toContain("\"accessToken\":");
    expect(stdout.join("")).not.toContain("\"refreshToken\":");
    expect(stdout.join("")).not.toContain("\"clientSecret\":");
    expect(stdout.join("")).not.toContain("raw-secret");
  });
});
