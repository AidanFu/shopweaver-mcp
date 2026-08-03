# Token Health Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe Google Drive token-health validation and preflight checks, using a shared status model that future Etsy, Amazon, and eBay checks can reuse.

**Architecture:** Create a small provider-neutral token-health module, then implement Google Drive status on top of existing `GoogleOAuth.refresh`, Keychain credentials, and local allowed-folder config. Wire the status into the MCP connection-status tool, a `google:status` CLI, and Drive import preflight without changing Drive scopes or adding marketplace writes.

**Tech Stack:** TypeScript, Zod, Vitest, macOS Keychain credential store, Google OAuth refresh endpoint, existing MCP server/tool registration.

---

## File structure

- Create `src/auth/token-health.ts`: shared provider/status types and helpers for access-token freshness.
- Create `src/google/status.ts`: Google Drive health checker that can optionally validate refresh.
- Create `src/google-status.ts`: JSON CLI runner for Google health status.
- Modify `src/tools/google-tools.ts`: expose enhanced `google_drive_connection_status` with `validateRefresh`.
- Modify `src/import/drive-import.ts`: run Google preflight before Drive import/write operations.
- Modify `src/import/drive-image-upload.ts`: run Google preflight before grouped/single Drive image planning.
- Modify `src/index.ts`: construct and inject Google health checker where needed.
- Modify `src/server.ts`: dependency type update if Google tools need a status service.
- Modify `package.json`: add `google:status` script.
- Modify `README.md` and `skills/shopweaver/SKILL.md`: document `npm run google:status`.
- Add/modify tests:
  - Create `tests/google-status.test.ts`
  - Modify `tests/google-tools.test.ts`
  - Modify `tests/import-tools.test.ts` or `tests/drive-image-upload.test.ts` for preflight behavior
  - Modify `tests/mcp-integration.test.ts` only if tool schema expectation requires it
  - Modify `tests/skill.test.ts` if docs assertions need updating

## Safety rules

- Never return or log access tokens, refresh tokens, client secrets, or raw Keychain payloads.
- Status checks may call token refresh endpoints only when `validateRefresh` is true.
- Status checks do not open a browser or run OAuth setup.
- Drive preflight must not browse the whole Drive; it may read local allowed-folder config.
- No marketplace writes are added.

---

### Task 1: Add shared token health types and freshness helper

**Files:**
- Create: `src/auth/token-health.ts`
- Create: `tests/token-health.test.ts`

- [ ] **Step 1: Write failing unit tests**

Create `tests/token-health.test.ts`:

```ts
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
    expect(JSON.stringify(status)).not.toContain("accessToken");
    expect(JSON.stringify(status)).not.toContain("refreshToken");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/token-health.test.ts
```

Expected: fail because `src/auth/token-health.ts` does not exist.

- [ ] **Step 3: Implement shared module**

Create `src/auth/token-health.ts`:

```ts
export type TokenHealthProvider = "google_drive" | "etsy" | "amazon_sp_api" | "amazon_ads" | "ebay";
export type AccessTokenStatus = "missing" | "valid" | "expiring" | "expired" | "unknown";
export type RefreshStatus = "not_needed" | "refreshed" | "failed" | "not_supported" | "skipped";

export type TokenHealthStatus = {
  provider: TokenHealthProvider;
  connected: boolean;
  credentialsAvailable: boolean;
  authorized: boolean;
  accessTokenStatus: AccessTokenStatus;
  refreshStatus: RefreshStatus;
  expiresAt: string | null;
  scopes: string[];
  nextAction: string | null;
};

export function accessTokenStatus(expiresAt: number | undefined, now = Date.now(), refreshWindowMs = 60_000): AccessTokenStatus {
  if (expiresAt === undefined) return "missing";
  if (expiresAt <= now) return "expired";
  if (expiresAt <= now + refreshWindowMs) return "expiring";
  return "valid";
}

export function isoExpiresAt(expiresAt: number | undefined): string | null {
  return expiresAt === undefined ? null : new Date(expiresAt).toISOString();
}

export function reconnectAction(providerName: string): string {
  return `Run npm run google:setup to reconnect ${providerName}.`;
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
npm test -- tests/token-health.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/auth/token-health.ts tests/token-health.test.ts
git commit -m "feat: add token health status model"
```

---

### Task 2: Implement Google Drive health checker

**Files:**
- Create: `src/google/status.ts`
- Create: `tests/google-status.test.ts`

- [ ] **Step 1: Write failing Google status tests**

Create `tests/google-status.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { GoogleDriveHealthService } from "../src/google/status.js";

async function service() {
  const store = new MemoryCredentialStore();
  const config = {
    listAllowedDriveFolders: vi.fn().mockResolvedValue([{ id: "folder", name: "HandMade" }])
  };
  const oauth = {
    refresh: vi.fn()
  };
  return { store, config, oauth, health: new GoogleDriveHealthService(store, config as never, oauth as never, () => 1_000) };
}

describe("GoogleDriveHealthService", () => {
  it("reports missing app credentials without refreshing", async () => {
    const { health, oauth } = await service();
    await expect(health.status({ validateRefresh: true })).resolves.toMatchObject({
      provider: "google_drive",
      connected: false,
      credentialsAvailable: false,
      authorized: false,
      refreshStatus: "skipped",
      nextAction: "Run npm run google:setup to connect Google Drive."
    });
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it("reports missing Google OAuth credentials", async () => {
    const { store, health } = await service();
    await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost:3004/google/redirect" });
    await expect(health.status({ validateRefresh: true })).resolves.toMatchObject({
      credentialsAvailable: true,
      authorized: false,
      accessTokenStatus: "missing",
      refreshStatus: "skipped"
    });
  });

  it("reports valid tokens without refresh", async () => {
    const { store, health, oauth } = await service();
    await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost:3004/google/redirect" });
    await store.set("google", { accessToken: "access", refreshToken: "refresh", expiresAt: 120_000, scopes: ["scope"] });
    const result = await health.status({ validateRefresh: true });
    expect(result).toMatchObject({
      connected: true,
      accessTokenStatus: "valid",
      refreshStatus: "not_needed",
      allowedFolders: [{ id: "folder", name: "HandMade" }]
    });
    expect(oauth.refresh).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("access");
    expect(JSON.stringify(result)).not.toContain("refresh");
  });

  it("skips refresh for expired token unless requested", async () => {
    const { store, health, oauth } = await service();
    await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost:3004/google/redirect" });
    await store.set("google", { accessToken: "access", refreshToken: "refresh", expiresAt: 900, scopes: ["scope"] });
    await expect(health.status({ validateRefresh: false })).resolves.toMatchObject({
      connected: false,
      accessTokenStatus: "expired",
      refreshStatus: "skipped",
      nextAction: "Run google_drive_connection_status with validateRefresh=true or run npm run google:status."
    });
    expect(oauth.refresh).not.toHaveBeenCalled();
  });

  it("refreshes expired token when requested", async () => {
    const { store, health, oauth } = await service();
    await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost:3004/google/redirect" });
    const google = { accessToken: "old", refreshToken: "refresh", expiresAt: 900, scopes: ["scope"] };
    await store.set("google", google);
    oauth.refresh.mockResolvedValue({ ...google, accessToken: "new", expiresAt: 120_000 });
    await expect(health.status({ validateRefresh: true })).resolves.toMatchObject({
      connected: true,
      accessTokenStatus: "valid",
      refreshStatus: "refreshed"
    });
  });

  it("reports failed refresh without exposing token values", async () => {
    const { store, health, oauth } = await service();
    await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost:3004/google/redirect" });
    await store.set("google", { accessToken: "access-secret", refreshToken: "refresh-secret", expiresAt: 900, scopes: ["scope"] });
    oauth.refresh.mockRejectedValue(new Error("bad refresh-secret"));
    const result = await health.status({ validateRefresh: true });
    expect(result).toMatchObject({
      connected: false,
      refreshStatus: "failed",
      nextAction: "Run npm run google:setup to reconnect Google Drive."
    });
    expect(JSON.stringify(result)).not.toContain("access-secret");
    expect(JSON.stringify(result)).not.toContain("refresh-secret");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/google-status.test.ts
```

Expected: fail because `src/google/status.ts` does not exist.

- [ ] **Step 3: Implement Google health service**

Create `src/google/status.ts`:

```ts
import type { CredentialStore, StoredRecords } from "../credentials/types.js";
import type { LocalConfigStore } from "../local-config.js";
import { accessTokenStatus, isoExpiresAt, reconnectAction, type TokenHealthStatus } from "../auth/token-health.js";
import { GoogleOAuth } from "./oauth.js";

export type GoogleDriveHealthStatus = TokenHealthStatus & {
  provider: "google_drive";
  allowedFolders: Array<{ id: string; name: string }>;
};

export type GoogleDriveHealthOptions = {
  validateRefresh?: boolean;
};

const CONNECT_ACTION = "Run npm run google:setup to connect Google Drive.";
const REFRESH_ACTION = "Run google_drive_connection_status with validateRefresh=true or run npm run google:status.";

export class GoogleDriveHealthService {
  constructor(
    private readonly store: CredentialStore,
    private readonly config: Pick<LocalConfigStore, "listAllowedDriveFolders">,
    private readonly oauth: Pick<GoogleOAuth, "refresh"> = new GoogleOAuth(store),
    private readonly now: () => number = Date.now
  ) {}

  async status(options: GoogleDriveHealthOptions = {}): Promise<GoogleDriveHealthStatus> {
    const [app, google, allowedFolders] = await Promise.all([
      this.store.get("googleApp"),
      this.store.get("google"),
      this.config.listAllowedDriveFolders()
    ]);
    if (!app) return this.result(false, false, false, "missing", "skipped", undefined, [], CONNECT_ACTION, allowedFolders);
    if (!google) return this.result(false, true, false, "missing", "skipped", undefined, [], CONNECT_ACTION, allowedFolders);
    const initialStatus = accessTokenStatus(google.expiresAt, this.now());
    if (initialStatus === "valid") {
      return this.result(true, true, true, "valid", "not_needed", google.expiresAt, google.scopes, null, allowedFolders);
    }
    if (!options.validateRefresh) {
      return this.result(false, true, true, initialStatus, "skipped", google.expiresAt, google.scopes, REFRESH_ACTION, allowedFolders);
    }
    try {
      const refreshed = await this.oauth.refresh(app, google);
      return this.result(true, true, true, accessTokenStatus(refreshed.expiresAt, this.now()), "refreshed", refreshed.expiresAt, refreshed.scopes, null, allowedFolders);
    } catch {
      return this.result(false, true, true, initialStatus, "failed", google.expiresAt, google.scopes, reconnectAction("Google Drive"), allowedFolders);
    }
  }

  async assertReady(): Promise<void> {
    const status = await this.status({ validateRefresh: true });
    if (!status.connected) throw new Error(status.nextAction ?? "Google Drive is not connected.");
  }

  private result(
    connected: boolean,
    credentialsAvailable: boolean,
    authorized: boolean,
    tokenStatus: GoogleDriveHealthStatus["accessTokenStatus"],
    refreshStatus: GoogleDriveHealthStatus["refreshStatus"],
    expiresAt: number | undefined,
    scopes: string[],
    nextAction: string | null,
    allowedFolders: Awaited<ReturnType<LocalConfigStore["listAllowedDriveFolders"]>>
  ): GoogleDriveHealthStatus {
    return {
      provider: "google_drive",
      connected,
      credentialsAvailable,
      authorized,
      accessTokenStatus: tokenStatus,
      refreshStatus,
      expiresAt: isoExpiresAt(expiresAt),
      scopes,
      nextAction,
      allowedFolders: allowedFolders.map(folder => ({ id: folder.id, name: folder.name }))
    };
  }
}
```

- [ ] **Step 4: Replace generic Error with ShopWeaverError**

Import `ShopWeaverError` and make `assertReady` throw:

```ts
throw new ShopWeaverError("GOOGLE_AUTH_REQUIRED", "Google Drive authorization expired or was revoked. Run npm run google:setup to reconnect Google Drive.");
```

when `refreshStatus === "failed"`, otherwise use `status.nextAction`.

- [ ] **Step 5: Run test and verify it passes**

Run:

```bash
npm test -- tests/google-status.test.ts tests/token-health.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/google/status.ts tests/google-status.test.ts
git commit -m "feat: validate Google Drive token health"
```

---

### Task 3: Wire enhanced Google status into MCP tool

**Files:**
- Modify: `src/tools/google-tools.ts`
- Modify: `src/server.ts`
- Modify: `src/index.ts`
- Modify: `tests/google-tools.test.ts`
- Modify: `tests/mcp-integration.test.ts` if needed

- [ ] **Step 1: Write failing Google tool tests**

Modify `tests/google-tools.test.ts` to assert enhanced status and refresh validation:

```ts
import { GoogleDriveHealthService } from "../src/google/status.js";
```

Add:

```ts
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
  await expect(googleConnectionStatus(store, health as never, { validateRefresh: true })).resolves.toMatchObject({
    connected: true,
    refreshStatus: "not_needed",
    allowedFolders: [{ id: "folder", name: "HandMade" }]
  });
  expect(health.status).toHaveBeenCalledWith({ validateRefresh: true });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/google-tools.test.ts tests/mcp-integration.test.ts
```

Expected: fail until tool/service wiring is added.

- [ ] **Step 3: Update Google tool service**

In `src/tools/google-tools.ts`:

- import `GoogleDriveHealthService`
- change `googleConnectionStatus` to:

```ts
export async function googleConnectionStatus(
  store: CredentialStore,
  health?: Pick<GoogleDriveHealthService, "status">,
  options: { validateRefresh?: boolean } = {}
) {
  if (health) return health.status(options);
  const [app, google] = await Promise.all([store.get("googleApp"), store.get("google")]);
  return {
    credentialsAvailable: app !== null,
    authorized: google !== null,
    scopes: google?.scopes ?? []
  };
}
```

- update `registerGoogleTools` signature to accept optional health service
- update tool input schema:

```ts
inputSchema: { validateRefresh: z.boolean().default(false) }
```

- pass `{ validateRefresh }` to `googleConnectionStatus`

- [ ] **Step 4: Update server dependencies and index wiring**

In `src/server.ts`:

- add optional `googleHealth?: GoogleDriveHealthService` to `ServerDependencies`
- pass it to `registerGoogleTools`

In `src/index.ts`:

- import `GoogleDriveHealthService`
- create:

```ts
const googleHealth = new GoogleDriveHealthService(store, localConfig);
```

- pass `googleHealth` into `createServer`

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/google-tools.test.ts tests/mcp-integration.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/google-tools.ts src/server.ts src/index.ts tests/google-tools.test.ts tests/mcp-integration.test.ts
git commit -m "feat: expose Google Drive token health status"
```

---

### Task 4: Add `npm run google:status` CLI

**Files:**
- Create: `src/google-status.ts`
- Modify: `package.json`
- Create or modify: `tests/google-status-cli.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Create `tests/google-status-cli.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runGoogleStatusCli } from "../src/google-status.js";

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
    const stdout: string[] = [];
    const exitCode = await runGoogleStatusCli({
      health: { status: vi.fn().mockResolvedValue({ connected: false, nextAction: "Run npm run google:setup to reconnect Google Drive.", accessToken: "secret" }) } as never,
      stdout: { write: (value: string) => { stdout.push(value); return true; } } as never
    });
    expect(exitCode).toBe(1);
    expect(stdout.join("")).not.toContain("secret");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/google-status-cli.test.ts
```

Expected: fail because CLI file does not exist.

- [ ] **Step 3: Implement CLI runner**

Create `src/google-status.ts`:

```ts
import { pathToFileURL } from "node:url";
import { KeychainCredentialStore } from "./credentials/keychain.js";
import { GoogleDriveHealthService } from "./google/status.js";
import { LocalConfigStore } from "./local-config.js";
import { redact } from "./redaction.js";

type CliDeps = {
  health?: Pick<GoogleDriveHealthService, "status">;
  stdout?: Pick<NodeJS.WriteStream, "write">;
};

function safeStatus(value: unknown) {
  const json = JSON.parse(JSON.stringify(value));
  delete json.accessToken;
  delete json.refreshToken;
  delete json.clientSecret;
  return json;
}

export async function runGoogleStatusCli(deps: CliDeps = {}) {
  const store = new KeychainCredentialStore();
  const health = deps.health ?? new GoogleDriveHealthService(store, new LocalConfigStore());
  const status = safeStatus(await health.status({ validateRefresh: true }));
  (deps.stdout ?? process.stdout).write(`${redact(JSON.stringify(status, null, 2))}\n`);
  return status.connected === true ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGoogleStatusCli().then(code => { process.exitCode = code; });
}
```

- [ ] **Step 4: Add package script**

In `package.json` scripts add:

```json
"google:status": "tsx src/google-status.ts"
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/google-status-cli.test.ts
npm run build
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/google-status.ts package.json tests/google-status-cli.test.ts
git commit -m "feat: add Google Drive status CLI"
```

---

### Task 5: Add Drive operation preflight

**Files:**
- Modify: `src/import/drive-import.ts`
- Modify: `src/import/drive-image-upload.ts`
- Modify: `src/index.ts`
- Modify: `tests/import-tools.test.ts`
- Modify: `tests/drive-image-upload.test.ts`

- [ ] **Step 1: Write failing preflight tests**

In `tests/import-tools.test.ts`, add:

```ts
it("runs Google health preflight before Drive import listing", async () => {
  const drive = {
    listFolderChildren: vi.fn()
  };
  const health = {
    assertReady: vi.fn().mockRejectedValue(new Error("Google Drive authorization expired or was revoked. Run npm run google:setup to reconnect Google Drive."))
  };
  const service = new DriveImportService(drive as never, health as never);
  await expect(service.importFolder("folder")).rejects.toThrow("Google Drive authorization expired");
  expect(drive.listFolderChildren).not.toHaveBeenCalled();
});
```

In `tests/drive-image-upload.test.ts`, add a grouped or single preview case where `health.assertReady` rejects and assert no Drive listing or Etsy calls occur.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npm test -- tests/import-tools.test.ts tests/drive-image-upload.test.ts
```

Expected: fail until constructors and preflight calls are added.

- [ ] **Step 3: Update DriveImportService**

In `src/import/drive-import.ts`:

- import `GoogleDriveHealthService` type
- update constructor:

```ts
constructor(
  private readonly drive: GoogleDriveService,
  private readonly health?: Pick<GoogleDriveHealthService, "assertReady">
) {}
```

- add private helper:

```ts
private async preflight() {
  await this.health?.assertReady();
}
```

- call `await this.preflight()` at the start of:
  - `importFolder`
  - `writeEnrichedWorkbook`
  - `writeAmazonListingWorkbook`
  - `writeWayfairListingWorkbook`
  - `writeWayfairPartnerTemplateWorkbook`
  - `analyzeWayfairPartnerTemplate`
  - `refreshAmazonOptimizationRecommendations`

- [ ] **Step 4: Update DriveImageUploadService**

In `src/import/drive-image-upload.ts`:

- accept optional health service in constructor
- call `await this.health?.assertReady()` before `buildPlan` and `buildVariationPlan` read Drive folder children
- preserve draft-state checks before Etsy uploads

- [ ] **Step 5: Wire index**

In `src/index.ts`:

- pass `googleHealth` into `new DriveImportService(googleDrive, googleHealth)`
- pass `googleHealth` into `new DriveImageUploadService(client, listings, googleDrive, store, new ConfirmationStore(), googleHealth)` after updating constructor order carefully

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- tests/import-tools.test.ts tests/drive-image-upload.test.ts
npm run build
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/import/drive-import.ts src/import/drive-image-upload.ts src/index.ts tests/import-tools.test.ts tests/drive-image-upload.test.ts
git commit -m "feat: preflight Google Drive operations"
```

---

### Task 6: Update docs, safety tests, and final verification

**Files:**
- Modify: `README.md`
- Modify: `skills/shopweaver/SKILL.md`
- Modify: `tests/skill.test.ts`
- Modify: `scripts/check-forbidden-tools.mjs` only if the enhanced tool schema/description requires safety updates

- [ ] **Step 1: Update docs**

Add this to the Google Drive section of `README.md` and `skills/shopweaver/SKILL.md`:

```md
Before Drive import work, run:

```bash
npm run google:status
```

This validates stored Google Drive authorization without printing tokens. If it reports `refreshStatus: "failed"` or `connected: false`, run `npm run google:setup` to reconnect Google Drive.
```

- [ ] **Step 2: Add skill/readme test assertions**

In `tests/skill.test.ts`, add assertions that docs mention:

```ts
"npm run google:status",
"refreshStatus",
"npm run google:setup"
```

- [ ] **Step 3: Run final verification**

Run:

```bash
npm test -- tests/skill.test.ts
npm run verify
```

If sandbox blocks localhost OAuth tests with `listen EPERM 127.0.0.1`, rerun `npm run verify` with the same escalation pattern used earlier.

- [ ] **Step 4: Commit**

```bash
git add README.md skills/shopweaver/SKILL.md tests/skill.test.ts scripts/check-forbidden-tools.mjs
git commit -m "docs: document Google token health checks"
```

---

### Task 7: Live read-only validation and push

**Files:**
- No source changes.

- [ ] **Step 1: Inspect branch state**

Run:

```bash
git status --short
git log --oneline --decorate -12
```

Expected: token-health commits are present; unrelated dirty files are identified and preserved.

- [ ] **Step 2: Run local Google status**

Run:

```bash
npm run google:status
```

Expected:

- If refresh succeeds: JSON shows `connected: true`.
- If refresh fails: JSON shows `connected: false`, `refreshStatus: "failed"`, and `nextAction` tells user to run `npm run google:setup`.

- [ ] **Step 3: Run read-only Drive variation preview if connected**

If `npm run google:status` returns connected, run the read-only variation group preview against allowed folder `1jGioNu6oQ5LJGq9C72NLuRrgAGxB4yAl`.

Expected: preview imports only the selected allowed folder and returns groups/rows without Etsy or Drive writes.

- [ ] **Step 4: Push**

Run:

```bash
GIT_SSH_COMMAND='ssh -F /dev/null -o IdentitiesOnly=yes -o IdentityFile=~/.ssh/id_ed25519_shopweaver_personal' \
  git push -u git@github.com:AidanFu/shopweaver-mcp.git codex/etsy-variation-design
```

Expected: branch pushes to `AidanFu/shopweaver-mcp`.

---

## Self-review checklist

- Spec coverage:
  - Shared status model: Task 1.
  - Google refresh validation: Task 2.
  - MCP status tool: Task 3.
  - CLI: Task 4.
  - Drive preflight: Task 5.
  - Docs/tests: Task 6.
  - Live read-only validation: Task 7.
- Safety:
  - No tokens printed.
  - No new Drive scope.
  - No browser launch from status.
  - No marketplace writes.
  - No repeated refresh loops.
- Scope:
  - Google is implemented first.
  - Amazon/Etsy/eBay are not refactored in this slice.
