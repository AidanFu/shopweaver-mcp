# Google Drive Listing Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-preserving Google Drive folder ingestion that parses handmade product spreadsheets and images into Etsy-ready draft preview data.

**Architecture:** Extend the existing local TypeScript MCP server with Google OAuth, an allowed-folder config, Drive API reads limited to configured folders, spreadsheet/image parsing, enriched workbook writing, and Etsy draft preview from enriched rows. Keep Google tokens in macOS Keychain, keep real folder config ignored, and preserve Etsy draft-only confirmation boundaries.

**Tech Stack:** TypeScript, MCP SDK, Zod, Vitest, macOS Keychain, Google Drive API v3, `xlsx` for workbook parsing/writing.

---

## File map

- Modify `package.json` and `package-lock.json`: add `xlsx`.
- Modify `.gitignore`: ignore `config.local.json`.
- Create `config.example.json`: documented allowed-folder template.
- Modify `src/credentials/types.ts`: add Google OAuth credential record.
- Modify `src/config.ts`: add Google OAuth constants and local config defaults.
- Create `src/local-config.ts`: read/write ignored local config.
- Create `src/google/oauth.ts`: Google OAuth URL, token exchange, refresh.
- Create `src/google/client.ts`: authenticated Google API wrapper.
- Create `src/google/drive.ts`: allowed-folder validation, file discovery, download/upload helpers.
- Create `src/google/folder-id.ts`: Drive URL or ID parser.
- Create `src/import/excel.ts`: parse raw workbook and write enriched workbook bytes.
- Create `src/import/matcher.ts`: match raw products to image folders/files.
- Create `src/import/enriched.ts`: parse enriched rows and validate Etsy draft fields.
- Create `src/tools/google-tools.ts`: MCP tools for Google connection and allowed folders.
- Create `src/tools/import-tools.ts`: MCP tools for folder import, enriched workbook write, and Etsy draft preview.
- Modify `src/server.ts`: register Google and import tools.
- Modify `src/index.ts`: instantiate Google and import services.
- Modify `src/setup.ts` or create `src/google-setup.ts`: Google connection setup entry point.
- Modify `package.json`: add `google:setup` script if using a separate setup command.
- Modify `scripts/check-forbidden-tools.mjs`: update allowlist for new approved tools.
- Modify `README.md`: document Drive setup, folder organization, config, and import workflow.
- Add tests:
  - `tests/local-config.test.ts`
  - `tests/google-oauth.test.ts`
  - `tests/google-drive.test.ts`
  - `tests/import-excel.test.ts`
  - `tests/import-matcher.test.ts`
  - `tests/enriched.test.ts`
  - `tests/google-tools.test.ts`
  - `tests/import-tools.test.ts`

## Task 1: Add dependency and config template

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Create: `config.example.json`

- [ ] **Step 1: Install workbook dependency**

Run:

```bash
npm install xlsx
```

Expected: `xlsx` appears in `dependencies`, and `package-lock.json` updates.

- [ ] **Step 2: Add ignored local config**

Modify `.gitignore` to include:

```gitignore
config.local.json
```

- [ ] **Step 3: Add example config**

Create `config.example.json`:

```json
{
  "googleDrive": {
    "allowedFolders": [
      {
        "id": "your-google-drive-folder-id",
        "name": "HandMade"
      }
    ]
  }
}
```

- [ ] **Step 4: Verify dependency and config**

Run:

```bash
npm run build
```

Expected: build passes.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore config.example.json
git commit -m "build: add Drive import workbook dependency"
```

## Task 2: Add local config storage

**Files:**
- Create: `src/local-config.ts`
- Test: `tests/local-config.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/local-config.test.ts`:

```ts
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
    expect(await store.listAllowedDriveFolders()).toEqual([{ id: "folder-1", name: "HandMade Updated" }]);
    await store.removeAllowedDriveFolder("folder-1");
    expect(await store.listAllowedDriveFolders()).toEqual([]);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ googleDrive: { allowedFolders: [] } });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/local-config.test.ts
```

Expected: FAIL because `src/local-config.ts` does not exist.

- [ ] **Step 3: Implement local config store**

Create `src/local-config.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const AllowedDriveFolderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  addedAt: z.string().optional()
}).strip();

const LocalConfigSchema = z.object({
  googleDrive: z.object({
    allowedFolders: z.array(AllowedDriveFolderSchema).default([])
  }).default({ allowedFolders: [] })
}).default({ googleDrive: { allowedFolders: [] } });

export type AllowedDriveFolder = z.infer<typeof AllowedDriveFolderSchema>;

export class LocalConfigStore {
  constructor(private readonly path = "config.local.json") {}

  private async readConfig() {
    try {
      return LocalConfigSchema.parse(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return LocalConfigSchema.parse({});
      throw error;
    }
  }

  private async writeConfig(config: z.infer<typeof LocalConfigSchema>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  async listAllowedDriveFolders(): Promise<AllowedDriveFolder[]> {
    return (await this.readConfig()).googleDrive.allowedFolders;
  }

  async addAllowedDriveFolder(folder: Pick<AllowedDriveFolder, "id" | "name">): Promise<AllowedDriveFolder> {
    const config = await this.readConfig();
    const updated = { ...folder, addedAt: new Date().toISOString() };
    config.googleDrive.allowedFolders = [
      ...config.googleDrive.allowedFolders.filter(existing => existing.id !== folder.id),
      updated
    ];
    await this.writeConfig(config);
    return updated;
  }

  async removeAllowedDriveFolder(folderId: string): Promise<void> {
    const config = await this.readConfig();
    config.googleDrive.allowedFolders = config.googleDrive.allowedFolders.filter(folder => folder.id !== folderId);
    await this.writeConfig(config);
  }

  async isDriveFolderAllowed(folderId: string): Promise<boolean> {
    return (await this.listAllowedDriveFolders()).some(folder => folder.id === folderId);
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
npx vitest run tests/local-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/local-config.ts tests/local-config.test.ts
git commit -m "feat: add local Drive folder config"
```

## Task 3: Add Google credential types and OAuth

**Files:**
- Modify: `src/credentials/types.ts`
- Modify: `src/config.ts`
- Create: `src/google/oauth.ts`
- Test: `tests/google-oauth.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/google-oauth.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { GoogleOAuth } from "../src/google/oauth.js";

describe("GoogleOAuth", () => {
  it("builds an authorization URL with Drive scope", () => {
    const oauth = new GoogleOAuth(new MemoryCredentialStore(), vi.fn());
    const authorization = oauth.createAuthorization("client-id", "http://localhost:3004/google/redirect");
    expect(authorization.url.origin).toBe("https://accounts.google.com");
    expect(authorization.url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/drive");
    expect(authorization.url.searchParams.get("access_type")).toBe("offline");
    expect(authorization.state.length).toBeGreaterThan(20);
  });

  it("exchanges a code and stores Google tokens", async () => {
    const store = new MemoryCredentialStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "google-access",
      refresh_token: "google-refresh",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/drive"
    }), { status: 200 }));
    const oauth = new GoogleOAuth(store, fetchMock, () => 1_000);
    await oauth.exchangeCode({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3004/google/redirect"
    }, "code");
    expect(await store.get("google")).toMatchObject({
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: 3_601_000
    });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/google-oauth.test.ts
```

Expected: FAIL because Google credential type and OAuth module do not exist.

- [ ] **Step 3: Add Google credential type**

Modify `src/credentials/types.ts` so `StoredRecords` includes:

```ts
googleApp: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};
google: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
};
```

- [ ] **Step 4: Add Google constants**

Modify `src/config.ts` to export:

```ts
export const GOOGLE_OAUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_API_BASE_URL = "https://www.googleapis.com";
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive"] as const;
export const DEFAULT_GOOGLE_REDIRECT_URI = "http://localhost:3004/google/redirect";
```

- [ ] **Step 5: Implement Google OAuth**

Create `src/google/oauth.ts`:

```ts
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { GOOGLE_OAUTH_BASE_URL, GOOGLE_SCOPES, GOOGLE_TOKEN_URL } from "../config.js";
import type { CredentialStore, StoredRecords } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import { registerSecret } from "../redaction.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const TokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string().optional()
}).strip();

export class GoogleOAuth {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now
  ) {}

  createAuthorization(clientId: string, redirectUri: string) {
    const state = randomBytes(32).toString("base64url");
    const url = new URL(GOOGLE_OAUTH_BASE_URL);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state
    }).toString();
    return { state, url };
  }

  async exchangeCode(app: StoredRecords["googleApp"], code: string): Promise<void> {
    const response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: app.redirectUri,
        grant_type: "authorization_code"
      })
    });
    if (!response.ok) throw new ShopWeaverError("GOOGLE_OAUTH_EXCHANGE_FAILED", "Google authorization failed; reconnect Google Drive.");
    const token = TokenSchema.parse(await response.json());
    registerSecret(token.access_token);
    if (token.refresh_token) registerSecret(token.refresh_token);
    await this.store.set("google", {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? "",
      expiresAt: this.now() + token.expires_in * 1000,
      scopes: token.scope?.split(" ") ?? [...GOOGLE_SCOPES]
    });
  }

  async refresh(app: StoredRecords["googleApp"], google: StoredRecords["google"]): Promise<StoredRecords["google"]> {
    const response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        refresh_token: google.refreshToken,
        grant_type: "refresh_token"
      })
    });
    if (!response.ok) throw new ShopWeaverError("GOOGLE_AUTH_REQUIRED", "Google Drive authorization expired; reconnect Google Drive.");
    const token = TokenSchema.parse(await response.json());
    const updated = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? google.refreshToken,
      expiresAt: this.now() + token.expires_in * 1000,
      scopes: google.scopes
    };
    await this.store.set("google", updated);
    return updated;
  }
}
```

- [ ] **Step 6: Run test to verify pass**

Run:

```bash
npx vitest run tests/google-oauth.test.ts tests/credentials.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/credentials/types.ts src/config.ts src/google/oauth.ts tests/google-oauth.test.ts
git commit -m "feat: add Google Drive OAuth boundary"
```

## Task 4: Add Google API client

**Files:**
- Create: `src/google/client.ts`
- Test: `tests/google-drive.test.ts`

- [ ] **Step 1: Write failing client tests**

Create `tests/google-drive.test.ts` with initial client coverage:

```ts
import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { GoogleClient } from "../src/google/client.js";

async function storeWithGoogle() {
  const store = new MemoryCredentialStore();
  await store.set("googleApp", { clientId: "client", clientSecret: "secret", redirectUri: "http://localhost/google" });
  await store.set("google", { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 60_000, scopes: ["https://www.googleapis.com/auth/drive"] });
  return store;
}

describe("GoogleClient", () => {
  it("sends bearer authorization and parses JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "folder", name: "HandMade" }), { status: 200 }));
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
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/google-drive.test.ts
```

Expected: FAIL because `GoogleClient` does not exist.

- [ ] **Step 3: Implement Google client**

Create `src/google/client.ts`:

```ts
import { GOOGLE_API_BASE_URL } from "../config.js";
import type { CredentialStore } from "../credentials/types.js";
import { ShopWeaverError } from "../errors.js";
import { GoogleOAuth } from "./oauth.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class GoogleClient {
  constructor(
    private readonly store: CredentialStore,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly oauth = new GoogleOAuth(store, fetchImpl)
  ) {}

  async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const app = await this.store.get("googleApp");
    let google = await this.store.get("google");
    if (!app || !google) throw new ShopWeaverError("GOOGLE_AUTH_REQUIRED", "Connect Google Drive before using this tool.");
    if (google.expiresAt <= Date.now() + 60_000) google = await this.oauth.refresh(app, google);
    const headers = { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${google.accessToken}` };
    const response = await this.fetchImpl(`${GOOGLE_API_BASE_URL}${path}`, { ...init, headers });
    if (!response.ok) throw new ShopWeaverError("GOOGLE_REQUEST_FAILED", "Google Drive request failed.");
    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return response.json();
    return response.arrayBuffer();
  }
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run tests/google-drive.test.ts tests/google-oauth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/google/client.ts tests/google-drive.test.ts
git commit -m "feat: add Google Drive API client"
```

## Task 5: Add folder ID parsing and allowed-folder Drive service

**Files:**
- Create: `src/google/folder-id.ts`
- Create: `src/google/drive.ts`
- Modify: `tests/google-drive.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/google-drive.test.ts`:

```ts
import { parseDriveFolderId } from "../src/google/folder-id.js";
import { GoogleDriveService } from "../src/google/drive.js";
import { LocalConfigStore } from "../src/local-config.js";

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
    config.listAllowedDriveFolders = vi.fn().mockResolvedValue([]);
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
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/google-drive.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement folder ID parser**

Create `src/google/folder-id.ts`:

```ts
import { ShopWeaverError } from "../errors.js";

export function parseDriveFolderId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ShopWeaverError("DRIVE_FOLDER_ID_INVALID", "Google Drive folder URL or ID is required.");
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/folders\/([^/]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    return trimmed;
  }
  return trimmed;
}
```

- [ ] **Step 4: Implement Drive service**

Create `src/google/drive.ts`:

```ts
import { z } from "zod";
import type { LocalConfigStore } from "../local-config.js";
import { ShopWeaverError } from "../errors.js";
import type { GoogleClient } from "./client.js";
import { parseDriveFolderId } from "./folder-id.js";

const FileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string()
}).strip();

const FileListSchema = z.object({
  files: z.array(FileSchema)
}).strip();

export type DriveFile = z.infer<typeof FileSchema>;

export class GoogleDriveService {
  constructor(private readonly api: GoogleClient, private readonly config: LocalConfigStore) {}

  async addAllowedFolder(folderUrlOrId: string) {
    const id = parseDriveFolderId(folderUrlOrId);
    const file = FileSchema.parse(await this.api.request(`/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType`));
    if (file.mimeType !== "application/vnd.google-apps.folder") throw new ShopWeaverError("DRIVE_FOLDER_INVALID", "Google Drive ID must point to a folder.");
    return this.config.addAllowedDriveFolder({ id: file.id, name: file.name });
  }

  async listAllowedFolders() {
    return this.config.listAllowedDriveFolders();
  }

  async removeAllowedFolder(folderId: string) {
    await this.config.removeAllowedDriveFolder(folderId);
  }

  async listFolderChildren(folderId: string): Promise<DriveFile[]> {
    if (!await this.config.isDriveFolderAllowed(folderId)) throw new ShopWeaverError("DRIVE_FOLDER_NOT_ALLOWED", "Google Drive folder is not in the allowed folder list.");
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const page = FileListSchema.parse(await this.api.request(`/drive/v3/files?q=${query}&fields=files(id,name,mimeType)`));
    return page.files;
  }

  async listChildrenByParentId(parentId: string): Promise<DriveFile[]> {
    const query = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
    const page = FileListSchema.parse(await this.api.request(`/drive/v3/files?q=${query}&fields=files(id,name,mimeType)`));
    return page.files;
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const data = await this.api.request(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!(data instanceof ArrayBuffer)) throw new ShopWeaverError("DRIVE_DOWNLOAD_FAILED", "Google Drive file download failed.");
    return new Uint8Array(data);
  }
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run tests/google-drive.test.ts tests/local-config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/google/folder-id.ts src/google/drive.ts tests/google-drive.test.ts
git commit -m "feat: add allowed Google Drive folders"
```

## Task 6: Add workbook parser

**Files:**
- Create: `src/import/excel.ts`
- Test: `tests/import-excel.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `tests/import-excel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseProductInformationWorkbook } from "../src/import/excel.js";

function workbookBytes(rows: Array<Array<string>>) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

describe("parseProductInformationWorkbook", () => {
  it("groups column C descriptions under the nearest column A product", () => {
    const bytes = workbookBytes([
      ["产品一", "", "第一行描述"],
      ["", "", "第二行描述"],
      ["", "", ""],
      ["产品二", "", "另一个描述"],
      ["", "", "更多描述"]
    ]);
    expect(parseProductInformationWorkbook(bytes)).toEqual([
      { productName: "产品一", rawChineseDescription: "第一行描述\n第二行描述", rowStart: 1, rowEnd: 2 },
      { productName: "产品二", rawChineseDescription: "另一个描述\n更多描述", rowStart: 4, rowEnd: 5 }
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/import-excel.test.ts
```

Expected: FAIL because parser does not exist.

- [ ] **Step 3: Implement parser**

Create `src/import/excel.ts`:

```ts
import * as XLSX from "xlsx";

export interface RawProductRecord {
  productName: string;
  rawChineseDescription: string;
  rowStart: number;
  rowEnd: number;
}

export function parseProductInformationWorkbook(bytes: Uint8Array): RawProductRecord[] {
  const workbook = XLSX.read(bytes, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Array<string>>(workbook.Sheets[firstSheetName], { header: 1, blankrows: false });
  const products: RawProductRecord[] = [];
  let current: { productName: string; descriptions: string[]; rowStart: number; rowEnd: number } | null = null;
  rows.forEach((row, index) => {
    const productName = String(row[0] ?? "").trim();
    const description = String(row[2] ?? "").trim();
    if (productName) {
      if (current) products.push({ productName: current.productName, rawChineseDescription: current.descriptions.join("\n"), rowStart: current.rowStart, rowEnd: current.rowEnd });
      current = { productName, descriptions: [], rowStart: index + 1, rowEnd: index + 1 };
    }
    if (current && description) {
      current.descriptions.push(description);
      current.rowEnd = index + 1;
    }
  });
  if (current) products.push({ productName: current.productName, rawChineseDescription: current.descriptions.join("\n"), rowStart: current.rowStart, rowEnd: current.rowEnd });
  return products;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run tests/import-excel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/excel.ts tests/import-excel.test.ts
git commit -m "feat: parse Drive product workbook"
```

## Task 7: Add product/image matcher

**Files:**
- Create: `src/import/matcher.ts`
- Test: `tests/import-matcher.test.ts`

- [ ] **Step 1: Write failing matcher tests**

Create `tests/import-matcher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchProductsToImages } from "../src/import/matcher.js";

describe("matchProductsToImages", () => {
  it("matches exact product folder names and sorts supported images", () => {
    const result = matchProductsToImages(
      [{ productName: "产品一", rawChineseDescription: "描述", rowStart: 1, rowEnd: 1 }],
      [
        { id: "folder1", name: "产品一", mimeType: "application/vnd.google-apps.folder" }
      ],
      new Map([["folder1", [
        { id: "img2", name: "02-detail.png", mimeType: "image/png" },
        { id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" },
        { id: "txt", name: "notes.txt", mimeType: "text/plain" }
      ]]])
    );
    expect(result.products[0].images.map(image => image.name)).toEqual(["01-main.jpg", "02-detail.png"]);
    expect(result.products[0].mainImage?.name).toBe("01-main.jpg");
    expect(result.unsupportedFiles).toEqual([{ productName: "产品一", fileName: "notes.txt", mimeType: "text/plain" }]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/import-matcher.test.ts
```

Expected: FAIL because matcher does not exist.

- [ ] **Step 3: Implement matcher**

Create `src/import/matcher.ts`:

```ts
import type { RawProductRecord } from "./excel.js";
import type { DriveFile } from "../google/drive.js";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const FOLDER_TYPE = "application/vnd.google-apps.folder";

export interface MatchedProduct extends RawProductRecord {
  imageFolderId: string | null;
  imageFolderName: string | null;
  images: DriveFile[];
  mainImage: DriveFile | null;
}

export function matchProductsToImages(rawProducts: RawProductRecord[], imageFolders: DriveFile[], imageFilesByFolderId: Map<string, DriveFile[]>) {
  const foldersByName = new Map(imageFolders.filter(folder => folder.mimeType === FOLDER_TYPE).map(folder => [folder.name, folder]));
  const matchedFolderNames = new Set<string>();
  const unsupportedFiles: Array<{ productName: string; fileName: string; mimeType: string }> = [];
  const products: MatchedProduct[] = rawProducts.map(product => {
    const folder = foldersByName.get(product.productName) ?? null;
    if (!folder) return { ...product, imageFolderId: null, imageFolderName: null, images: [], mainImage: null };
    matchedFolderNames.add(folder.name);
    const supported = [];
    for (const file of imageFilesByFolderId.get(folder.id) ?? []) {
      if (IMAGE_TYPES.has(file.mimeType)) supported.push(file);
      else unsupportedFiles.push({ productName: product.productName, fileName: file.name, mimeType: file.mimeType });
    }
    const images = supported.sort((a, b) => a.name.localeCompare(b.name));
    return { ...product, imageFolderId: folder.id, imageFolderName: folder.name, images, mainImage: images[0] ?? null };
  });
  return {
    products,
    unmatchedProducts: products.filter(product => !product.imageFolderId).map(product => product.productName),
    unusedImageFolders: imageFolders.filter(folder => folder.mimeType === FOLDER_TYPE && !matchedFolderNames.has(folder.name)).map(folder => folder.name),
    unsupportedFiles
  };
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run tests/import-matcher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/matcher.ts tests/import-matcher.test.ts
git commit -m "feat: match Drive products to images"
```

## Task 8: Add enriched workbook writer and parser

**Files:**
- Modify: `src/import/excel.ts`
- Create: `src/import/enriched.ts`
- Test: `tests/enriched.test.ts`

- [ ] **Step 1: Write failing enriched tests**

Create `tests/enriched.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { writeEnrichedWorkbook } from "../src/import/excel.js";
import { parseEnrichedRows, validateEnrichedDraftRow } from "../src/import/enriched.js";

describe("enriched workbook", () => {
  it("writes and parses enriched rows", () => {
    const bytes = writeEnrichedWorkbook([{
      productName: "产品一",
      rawChineseDescription: "中文描述",
      imageFolder: "产品一",
      imageCount: 2,
      validationStatus: "needs_enrichment",
      validationNotes: "Missing English title"
    }]);
    const workbook = XLSX.read(bytes, { type: "array" });
    expect(workbook.SheetNames[0]).toBe("Etsy Drafts");
    const rows = parseEnrichedRows(bytes);
    expect(rows[0]).toMatchObject({ productName: "产品一", rawChineseDescription: "中文描述", imageCount: 2 });
  });

  it("validates required physical draft fields", () => {
    expect(validateEnrichedDraftRow({
      productName: "产品一",
      englishTitle: "Handmade Bowl",
      englishDescription: "A handmade decorative bowl.",
      quantity: 1,
      price: "12.00",
      taxonomyId: 123,
      whoMade: "i_did",
      whenMade: "2020_2026",
      type: "physical",
      readinessStateId: 456,
      imageFolder: "产品一",
      imageCount: 2
    })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/enriched.test.ts
```

Expected: FAIL because functions do not exist.

- [ ] **Step 3: Implement enriched workbook write/read**

Append to `src/import/excel.ts`:

```ts
export interface EnrichedWorkbookRow {
  productName: string;
  rawChineseDescription?: string;
  englishTitle?: string;
  englishDescription?: string;
  shortSummary?: string;
  tags?: string;
  materials?: string;
  quantity?: number;
  price?: string;
  taxonomyId?: number;
  taxonomyPath?: string;
  whoMade?: string;
  whenMade?: string;
  type?: string;
  readinessStateId?: number;
  imageFolder?: string;
  imageCount?: number;
  validationStatus?: string;
  validationNotes?: string;
}

const ENRICHED_HEADERS = [
  "Product Name",
  "Raw Chinese Description",
  "English Title",
  "English Description",
  "Short Summary",
  "Tags",
  "Materials",
  "Quantity",
  "Price",
  "Taxonomy ID",
  "Taxonomy Path",
  "Who Made",
  "When Made",
  "Type",
  "Readiness State ID",
  "Image Folder",
  "Image Count",
  "Validation Status",
  "Validation Notes"
];

export function writeEnrichedWorkbook(rows: EnrichedWorkbookRow[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const values = rows.map(row => [
    row.productName,
    row.rawChineseDescription ?? "",
    row.englishTitle ?? "",
    row.englishDescription ?? "",
    row.shortSummary ?? "",
    row.tags ?? "",
    row.materials ?? "",
    row.quantity ?? "",
    row.price ?? "",
    row.taxonomyId ?? "",
    row.taxonomyPath ?? "",
    row.whoMade ?? "",
    row.whenMade ?? "",
    row.type ?? "",
    row.readinessStateId ?? "",
    row.imageFolder ?? "",
    row.imageCount ?? "",
    row.validationStatus ?? "",
    row.validationNotes ?? ""
  ]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([ENRICHED_HEADERS, ...values]), "Etsy Drafts");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}
```

- [ ] **Step 4: Implement enriched row parsing and validation**

Create `src/import/enriched.ts`:

```ts
import * as XLSX from "xlsx";
import { z } from "zod";

export const EnrichedDraftRowSchema = z.object({
  productName: z.string().min(1),
  rawChineseDescription: z.string().optional(),
  englishTitle: z.string().optional(),
  englishDescription: z.string().optional(),
  tags: z.string().optional(),
  materials: z.string().optional(),
  quantity: z.number().int().nonnegative().optional(),
  price: z.string().optional(),
  taxonomyId: z.number().int().positive().optional(),
  taxonomyPath: z.string().optional(),
  whoMade: z.string().optional(),
  whenMade: z.string().optional(),
  type: z.string().optional(),
  readinessStateId: z.number().int().positive().optional(),
  imageFolder: z.string().optional(),
  imageCount: z.number().int().nonnegative().optional()
}).passthrough();

export type EnrichedDraftRow = z.infer<typeof EnrichedDraftRowSchema>;

export function parseEnrichedRows(bytes: Uint8Array): EnrichedDraftRow[] {
  const workbook = XLSX.read(bytes, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  return rows.map(row => EnrichedDraftRowSchema.parse({
    productName: row["Product Name"],
    rawChineseDescription: row["Raw Chinese Description"],
    englishTitle: row["English Title"],
    englishDescription: row["English Description"],
    tags: row["Tags"],
    materials: row["Materials"],
    quantity: row["Quantity"],
    price: row["Price"] === undefined ? undefined : String(row["Price"]),
    taxonomyId: row["Taxonomy ID"],
    taxonomyPath: row["Taxonomy Path"],
    whoMade: row["Who Made"],
    whenMade: row["When Made"],
    type: row["Type"],
    readinessStateId: row["Readiness State ID"],
    imageFolder: row["Image Folder"],
    imageCount: row["Image Count"]
  }));
}

export function validateEnrichedDraftRow(row: EnrichedDraftRow): string[] {
  const errors: string[] = [];
  if (!row.englishTitle) errors.push("English Title is required.");
  if (!row.englishDescription) errors.push("English Description is required.");
  if (row.quantity === undefined) errors.push("Quantity is required.");
  if (!row.price) errors.push("Price is required.");
  if (row.taxonomyId === undefined) errors.push("Taxonomy ID is required.");
  if (!row.whoMade) errors.push("Who Made is required.");
  if (!row.whenMade) errors.push("When Made is required.");
  if (row.type !== "physical") errors.push("Type must be physical.");
  if (row.readinessStateId === undefined) errors.push("Readiness State ID is required.");
  if (!row.imageFolder) errors.push("Image Folder is required.");
  if (!row.imageCount) errors.push("At least one image is required.");
  return errors;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run tests/enriched.test.ts tests/import-excel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/import/excel.ts src/import/enriched.ts tests/enriched.test.ts
git commit -m "feat: add enriched Etsy workbook model"
```

## Task 9: Add Google Drive MCP tools

**Files:**
- Create: `src/tools/google-tools.ts`
- Modify: `src/server.ts`
- Modify: `tests/mcp-integration.test.ts`
- Test: `tests/google-tools.test.ts`

- [ ] **Step 1: Write failing tool tests**

Create `tests/google-tools.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { googleConnectionStatus, GoogleFolderToolService } from "../src/tools/google-tools.js";

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
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/google-tools.test.ts
```

Expected: FAIL because tool module does not exist.

- [ ] **Step 3: Implement Google tool module**

Create `src/tools/google-tools.ts`:

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CredentialStore } from "../credentials/types.js";
import type { GoogleDriveService } from "../google/drive.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export async function googleConnectionStatus(store: CredentialStore) {
  const [app, google] = await Promise.all([store.get("googleApp"), store.get("google")]);
  return {
    credentialsAvailable: app !== null,
    authorized: google !== null,
    scopes: google?.scopes ?? []
  };
}

export class GoogleFolderToolService {
  constructor(private readonly drive: GoogleDriveService) {}

  async addAllowedFolder(folderUrlOrId: string) {
    return this.drive.addAllowedFolder(folderUrlOrId);
  }

  async listAllowedFolders() {
    return this.drive.listAllowedFolders();
  }

  async removeAllowedFolder(folderId: string) {
    await this.drive.removeAllowedFolder(folderId);
    return { removed: true };
  }
}

export function registerGoogleTools(server: McpServer, store: CredentialStore, folders: GoogleFolderToolService): void {
  server.registerTool("google_drive_connection_status", {
    description: "Report whether Google Drive credentials are available without revealing tokens.",
    inputSchema: {}
  }, async () => result(await googleConnectionStatus(store)));

  server.registerTool("google_drive_add_allowed_folder", {
    description: "Validate and add one Google Drive folder by URL or ID to the allowed-folder list.",
    inputSchema: { folderUrlOrId: z.string().min(1) }
  }, async ({ folderUrlOrId }) => result(await folders.addAllowedFolder(folderUrlOrId)));

  server.registerTool("google_drive_list_allowed_folders", {
    description: "List Google Drive folders explicitly allowed for ShopWeaver imports.",
    inputSchema: {}
  }, async () => result(await folders.listAllowedFolders()));

  server.registerTool("google_drive_remove_allowed_folder", {
    description: "Remove one Google Drive folder from the allowed-folder list.",
    inputSchema: { folderId: z.string().min(1) }
  }, async ({ folderId }) => result(await folders.removeAllowedFolder(folderId)));
}
```

- [ ] **Step 4: Register tools in server**

Modify `src/server.ts`:

```ts
import { registerGoogleTools, type GoogleFolderToolService } from "./tools/google-tools.js";
```

Add to `ServerDependencies`:

```ts
googleFolders?: GoogleFolderToolService;
```

Add in `createServer`:

```ts
if (dependencies.store && dependencies.googleFolders) registerGoogleTools(server, dependencies.store, dependencies.googleFolders);
```

- [ ] **Step 5: Update MCP integration allowlist test**

Modify `tests/mcp-integration.test.ts` expected tool list to include:

```ts
"google_drive_add_allowed_folder",
"google_drive_connection_status",
"google_drive_list_allowed_folders",
"google_drive_remove_allowed_folder",
```

- [ ] **Step 6: Run tests**

Run:

```bash
npx vitest run tests/google-tools.test.ts tests/mcp-integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/google-tools.ts src/server.ts tests/google-tools.test.ts tests/mcp-integration.test.ts
git commit -m "feat: expose Google Drive folder tools"
```

## Task 10: Add Drive folder import service and tool

**Files:**
- Create: `src/import/drive-import.ts`
- Create: `src/tools/import-tools.ts`
- Modify: `src/server.ts`
- Modify: `tests/mcp-integration.test.ts`
- Test: `tests/import-tools.test.ts`

- [ ] **Step 1: Write failing import tests**

Create `tests/import-tools.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { DriveImportService } from "../src/import/drive-import.js";

function workbookBytes() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["产品一", "", "描述"]]), "Sheet1");
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
}

describe("DriveImportService", () => {
  it("imports workbook records and matched images from an allowed folder", async () => {
    const drive = {
      listFolderChildren: vi.fn().mockResolvedValue([
        { id: "xlsx", name: "Product Information.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { id: "images", name: "Images", mimeType: "application/vnd.google-apps.folder" }
      ]),
      listChildrenByParentId: vi.fn()
        .mockResolvedValueOnce([{ id: "p1", name: "产品一", mimeType: "application/vnd.google-apps.folder" }])
        .mockResolvedValueOnce([{ id: "img1", name: "01-main.jpg", mimeType: "image/jpeg" }]),
      downloadFile: vi.fn().mockResolvedValue(workbookBytes())
    };
    const service = new DriveImportService(drive as never);
    const result = await service.importFolder("folder");
    expect(result.products[0]).toMatchObject({ productName: "产品一", imageCount: 1, mainImageName: "01-main.jpg" });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/import-tools.test.ts
```

Expected: FAIL because import service does not exist.

- [ ] **Step 3: Implement import service**

Create `src/import/drive-import.ts`:

```ts
import type { GoogleDriveService } from "../google/drive.js";
import { ShopWeaverError } from "../errors.js";
import { parseProductInformationWorkbook } from "./excel.js";
import { matchProductsToImages } from "./matcher.js";

const FOLDER_TYPE = "application/vnd.google-apps.folder";

export class DriveImportService {
  constructor(private readonly drive: GoogleDriveService) {}

  async importFolder(folderId: string) {
    const rootChildren = await this.drive.listFolderChildren(folderId);
    const workbook = rootChildren.find(file => file.name === "Product Information.xlsx");
    const imagesFolder = rootChildren.find(file => file.name === "Images" && file.mimeType === FOLDER_TYPE);
    if (!workbook) throw new ShopWeaverError("DRIVE_WORKBOOK_MISSING", "Allowed Drive folder must contain Product Information.xlsx.");
    if (!imagesFolder) throw new ShopWeaverError("DRIVE_IMAGES_FOLDER_MISSING", "Allowed Drive folder must contain Images folder.");
    const rawProducts = parseProductInformationWorkbook(await this.drive.downloadFile(workbook.id));
    const imageFolders = await this.drive.listChildrenByParentId(imagesFolder.id);
    const imageFilesByFolderId = new Map();
    for (const folder of imageFolders.filter(file => file.mimeType === FOLDER_TYPE)) {
      imageFilesByFolderId.set(folder.id, await this.drive.listChildrenByParentId(folder.id));
    }
    const matched = matchProductsToImages(rawProducts, imageFolders, imageFilesByFolderId);
    return {
      products: matched.products.map(product => ({
        productName: product.productName,
        rawChineseDescription: product.rawChineseDescription,
        imageFolderId: product.imageFolderId,
        imageFolderName: product.imageFolderName,
        imageCount: product.images.length,
        mainImageName: product.mainImage?.name ?? null,
        images: product.images.map(image => ({ id: image.id, name: image.name, mimeType: image.mimeType }))
      })),
      unmatchedProducts: matched.unmatchedProducts,
      unusedImageFolders: matched.unusedImageFolders,
      unsupportedFiles: matched.unsupportedFiles
    };
  }
}
```

- [ ] **Step 4: Implement import MCP tool**

Create `src/tools/import-tools.ts`:

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DriveImportService } from "../import/drive-import.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export function registerImportTools(server: McpServer, imports: DriveImportService): void {
  server.registerTool("shopweaver_import_drive_folder", {
    description: "Import Product Information.xlsx and matched product images from one explicitly allowed Google Drive folder.",
    inputSchema: { folderId: z.string().min(1) }
  }, async ({ folderId }) => result(await imports.importFolder(folderId)));
}
```

- [ ] **Step 5: Register import tool**

Modify `src/server.ts`:

```ts
import { registerImportTools } from "./tools/import-tools.js";
import type { DriveImportService } from "./import/drive-import.js";
```

Add to `ServerDependencies`:

```ts
driveImports?: DriveImportService;
```

Add in `createServer`:

```ts
if (dependencies.driveImports) registerImportTools(server, dependencies.driveImports);
```

- [ ] **Step 6: Update MCP integration allowlist test**

Add expected tool:

```ts
"shopweaver_import_drive_folder",
```

- [ ] **Step 7: Run tests**

Run:

```bash
npx vitest run tests/import-tools.test.ts tests/mcp-integration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/import/drive-import.ts src/tools/import-tools.ts src/server.ts tests/import-tools.test.ts tests/mcp-integration.test.ts
git commit -m "feat: import products from Drive folders"
```

## Task 11: Add enriched workbook write tool

**Files:**
- Modify: `src/google/drive.ts`
- Modify: `src/import/drive-import.ts`
- Modify: `src/tools/import-tools.ts`
- Modify: `tests/import-tools.test.ts`

- [ ] **Step 1: Add failing test for enriched workbook write**

Append to `tests/import-tools.test.ts`:

```ts
it("writes enriched workbook bytes back to Drive", async () => {
  const drive = {
    uploadFile: vi.fn().mockResolvedValue({ id: "enriched", name: "Product Information - Etsy Draft.xlsx" })
  };
  const service = new DriveImportService(drive as never);
  await expect(service.writeEnrichedWorkbook("folder", [{
    productName: "产品一",
    rawChineseDescription: "描述",
    imageFolder: "产品一",
    imageCount: 1,
    validationStatus: "needs_enrichment",
    validationNotes: "Missing English title"
  }])).resolves.toMatchObject({ id: "enriched", name: "Product Information - Etsy Draft.xlsx" });
  expect(drive.uploadFile).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/import-tools.test.ts
```

Expected: FAIL because `writeEnrichedWorkbook` and `uploadFile` do not exist.

- [ ] **Step 3: Add Drive upload helper**

Modify `src/google/drive.ts`:

```ts
async uploadFile(parentFolderId: string, name: string, bytes: Uint8Array, mimeType: string) {
  if (!await this.config.isDriveFolderAllowed(parentFolderId)) throw new ShopWeaverError("DRIVE_FOLDER_NOT_ALLOWED", "Google Drive folder is not in the allowed folder list.");
  const boundary = `shopweaver-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: [parentFolderId] });
  const body = new Blob([
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--`
  ]);
  return this.api.request(`/upload/drive/v3/files?uploadType=multipart&fields=id,name`, {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body
  });
}
```

- [ ] **Step 4: Add enriched workbook write service**

Modify `src/import/drive-import.ts`:

```ts
import { writeEnrichedWorkbook, type EnrichedWorkbookRow } from "./excel.js";
```

Add method:

```ts
async writeEnrichedWorkbook(folderId: string, rows: EnrichedWorkbookRow[]) {
  const bytes = writeEnrichedWorkbook(rows);
  return this.drive.uploadFile(folderId, "Product Information - Etsy Draft.xlsx", bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
```

- [ ] **Step 5: Add MCP write tool with confirmation**

Modify `src/tools/import-tools.ts` to register:

```ts
server.registerTool("shopweaver_write_enriched_workbook", {
  description: "Create or update Product Information - Etsy Draft.xlsx in an allowed Google Drive folder after explicit confirmation.",
  inputSchema: {
    mode: z.enum(["preview", "confirm"]).default("preview"),
    folderId: z.string().min(1),
    rows: z.array(z.record(z.string(), z.unknown())).min(1)
  }
}, async ({ mode, folderId, rows }) => {
  if (mode === "preview") return result({ operation: "write_enriched_workbook", folderId, rowCount: rows.length, warning: "This will write Product Information - Etsy Draft.xlsx to Google Drive only after confirm mode." });
  return result(await imports.writeEnrichedWorkbook(folderId, rows as never));
});
```

- [ ] **Step 6: Update MCP integration test**

Add expected tool:

```ts
"shopweaver_write_enriched_workbook",
```

- [ ] **Step 7: Run tests**

Run:

```bash
npx vitest run tests/import-tools.test.ts tests/mcp-integration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/google/drive.ts src/import/drive-import.ts src/tools/import-tools.ts tests/import-tools.test.ts tests/mcp-integration.test.ts
git commit -m "feat: write enriched workbook to Drive"
```

## Task 12: Add Etsy draft preview from enriched row

**Files:**
- Modify: `src/tools/import-tools.ts`
- Test: `tests/import-tools.test.ts`

- [ ] **Step 1: Add failing preview test**

Append to `tests/import-tools.test.ts`:

```ts
import { previewDraftInputFromEnrichedRow } from "../src/tools/import-tools.js";

it("maps an enriched physical row to Etsy draft input", () => {
  const preview = previewDraftInputFromEnrichedRow({
    productName: "产品一",
    englishTitle: "Handmade Wooden Bowl",
    englishDescription: "A handmade wooden bowl.",
    tags: "wood bowl, handmade bowl",
    materials: "wood",
    quantity: 1,
    price: "12.00",
    taxonomyId: 123,
    whoMade: "i_did",
    whenMade: "2020_2026",
    type: "physical",
    readinessStateId: 456,
    imageFolder: "产品一",
    imageCount: 2
  });
  expect(preview.validationErrors).toEqual([]);
  expect(preview.draftInput).toMatchObject({ title: "Handmade Wooden Bowl", type: "physical", taxonomyId: 123 });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/import-tools.test.ts
```

Expected: FAIL because mapper does not exist.

- [ ] **Step 3: Implement enriched row draft mapper**

Modify `src/tools/import-tools.ts`:

```ts
import { EnrichedDraftRowSchema, validateEnrichedDraftRow, type EnrichedDraftRow } from "../import/enriched.js";

export function previewDraftInputFromEnrichedRow(rowInput: unknown) {
  const row = EnrichedDraftRowSchema.parse(rowInput);
  const validationErrors = validateEnrichedDraftRow(row);
  if (validationErrors.length > 0) return { validationErrors, draftInput: null };
  return {
    validationErrors,
    draftInput: {
      title: row.englishTitle,
      description: row.englishDescription,
      quantity: row.quantity,
      price: row.price,
      taxonomyId: row.taxonomyId,
      whoMade: row.whoMade,
      whenMade: row.whenMade,
      type: "physical",
      tags: row.tags?.split(",").map(tag => tag.trim()).filter(Boolean),
      materials: row.materials?.split(",").map(material => material.trim()).filter(Boolean),
      readinessStateId: row.readinessStateId
    }
  };
}
```

- [ ] **Step 4: Register preview tool**

Modify `registerImportTools` to add:

```ts
server.registerTool("shopweaver_preview_etsy_draft_from_enriched_row", {
  description: "Validate one enriched workbook row and produce an Etsy draft payload preview without writing to Etsy.",
  inputSchema: { row: z.record(z.string(), z.unknown()) }
}, async ({ row }) => result(previewDraftInputFromEnrichedRow(row)));
```

- [ ] **Step 5: Update MCP integration test**

Add expected tool:

```ts
"shopweaver_preview_etsy_draft_from_enriched_row",
```

- [ ] **Step 6: Run tests**

Run:

```bash
npx vitest run tests/import-tools.test.ts tests/mcp-integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/import-tools.ts tests/import-tools.test.ts tests/mcp-integration.test.ts
git commit -m "feat: preview Etsy drafts from enriched rows"
```

## Task 13: Wire production services and Google setup command

**Files:**
- Modify: `src/index.ts`
- Create: `src/google-setup.ts`
- Modify: `package.json`
- Test: `tests/server.test.ts`

- [ ] **Step 1: Update production wiring**

Modify `src/index.ts` to instantiate:

```ts
import { LocalConfigStore } from "./local-config.js";
import { GoogleClient } from "./google/client.js";
import { GoogleDriveService } from "./google/drive.js";
import { GoogleFolderToolService } from "./tools/google-tools.js";
import { DriveImportService } from "./import/drive-import.js";
```

Add:

```ts
const localConfig = new LocalConfigStore();
const googleClient = new GoogleClient(store);
const googleDrive = new GoogleDriveService(googleClient, localConfig);
const googleFolders = new GoogleFolderToolService(googleDrive);
const driveImports = new DriveImportService(googleDrive);
const server = createServer({ store, listings, orders, writes, googleFolders, driveImports });
```

- [ ] **Step 2: Create Google setup command**

Create `src/google-setup.ts` with the same prompt pattern as `src/setup.ts`, collecting Google client ID and client secret through masked terminal prompts, using `DEFAULT_GOOGLE_REDIRECT_URI`, `waitForOAuthCallback`, and `GoogleOAuth`.

Use labels:

```text
Google OAuth client ID:
Google OAuth client secret:
Registered Google redirect URI [http://localhost:3004/google/redirect]:
```

Expected success output:

```text
ShopWeaver connected Google Drive.
```

- [ ] **Step 3: Add npm script**

Modify `package.json` scripts:

```json
"google:setup": "tsx src/google-setup.ts"
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/google-setup.ts package.json package-lock.json tests/server.test.ts
git commit -m "feat: wire Google Drive import services"
```

## Task 14: Update safety allowlist and docs

**Files:**
- Modify: `scripts/check-forbidden-tools.mjs`
- Modify: `README.md`
- Modify: `SECURITY.md`

- [ ] **Step 1: Update safety allowlist**

Modify `scripts/check-forbidden-tools.mjs` approved tools to include:

```js
"google_drive_connection_status",
"google_drive_add_allowed_folder",
"google_drive_list_allowed_folders",
"google_drive_remove_allowed_folder",
"shopweaver_import_drive_folder",
"shopweaver_write_enriched_workbook",
"shopweaver_preview_etsy_draft_from_enriched_row",
```

Do not add broad Drive scan, delete, publish, message, or email tools.

- [ ] **Step 2: Update README**

Add sections:

```markdown
## Connect Google Drive

Create a Google OAuth client with redirect URI:

http://localhost:3004/google/redirect

Run:

npm run google:setup

Google tokens are stored in macOS Keychain. Allowed folder metadata is stored in ignored local config.

## Google Drive folder layout

HandMade/
├── Product Information.xlsx
└── Images/
    └── Product Name/
        ├── 01-main.jpg
        └── ...

## Drive import workflow

1. Add an allowed folder by URL or ID.
2. Import folder records.
3. Review matched product/image report.
4. Use Codex to translate and enrich rows.
5. Confirm writing Product Information - Etsy Draft.xlsx.
6. Preview one Etsy draft from one enriched row.
7. Confirm Etsy draft creation and image uploads separately.
```

- [ ] **Step 3: Update SECURITY.md**

Document:

```markdown
Google OAuth tokens are stored in macOS Keychain. Real Drive folder config must not be committed. The app reads only explicitly allowed Drive folders and does not scan all Drive files.
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm run verify
rg -n "google_drive|shopweaver_import_drive_folder|shopweaver_write_enriched_workbook" README.md scripts/check-forbidden-tools.mjs
```

Expected: verify passes and docs/tool allowlist mention approved tools.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-forbidden-tools.mjs README.md SECURITY.md
git commit -m "docs: document Google Drive import workflow"
```

## Task 15: Patch Etsy inventory null schema

**Files:**
- Modify: `src/etsy/schemas.ts`
- Test: `tests/read-tools.test.ts`

- [ ] **Step 1: Add failing test**

Append to `tests/read-tools.test.ts`:

```ts
it("accepts null readiness state in listing inventory", async () => {
  const request = vi.fn().mockResolvedValue({ products: [{ product_id: 1, sku: "ABC", property_values: [], offerings: [{ quantity: 1, is_enabled: true, readiness_state_id: null }] }] });
  const service = new ListingService({ request } as never, await storeWithShop());
  const inventory = await service.getListingInventory(7);
  expect(inventory.products[0].offerings[0].readinessStateId).toBeNull();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npx vitest run tests/read-tools.test.ts
```

Expected: FAIL because `readiness_state_id` rejects null.

- [ ] **Step 3: Patch schema**

Modify `OfferingSchema` in `src/etsy/schemas.ts`:

```ts
readiness_state_id: z.number().int().positive().nullable().optional()
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run tests/read-tools.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/etsy/schemas.ts tests/read-tools.test.ts
git commit -m "fix: accept null Etsy readiness state"
```

## Task 16: Final verification and push

**Files:**
- All changed files

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run verify
git diff --check
rg -n "publish|delete|advert|refund|cancel|shipment|message|email" src scripts README.md SECURITY.md skills/shopweaver/SKILL.md
```

Expected:

- build passes
- all tests pass
- safety allowlist passes
- whitespace check is clean
- no forbidden Etsy operation tool is introduced

- [ ] **Step 2: Verify working tree**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected: branch is `codex/shopweaver-implementation` and worktree is clean after commits.

- [ ] **Step 3: Push with personal SSH key**

Run:

```bash
GIT_SSH_COMMAND='ssh -F /dev/null -o IdentitiesOnly=yes -o IdentityFile=~/.ssh/id_ed25519_shopweaver_personal' git push -u git@github.com:AidanFu/shopweaver-mcp.git codex/shopweaver-implementation
```

Expected: push succeeds.

## Self-review

Spec coverage:

- Google OAuth connection: Tasks 3, 13.
- Allowed-folder model: Tasks 2, 5, 9.
- Local ignored config plus example config: Tasks 1, 2.
- Excel parser: Task 6.
- Image matching and ordering: Task 7.
- Enriched workbook: Tasks 8, 11.
- MCP tools: Tasks 9, 10, 11, 12.
- Etsy draft preview from enriched row: Task 12.
- Safety allowlist and docs: Task 14.
- Current Etsy null readiness bug: Task 15.
- Final verification/push: Task 16.

Placeholder scan: no TODO/TBD placeholders remain; each implementation task has concrete file paths, code, commands, and expected results.

Type consistency: Google credential records are `googleApp` and `google`; allowed folder records use `id`, `name`, `addedAt`; enriched row fields match the workbook headers and mapper.
