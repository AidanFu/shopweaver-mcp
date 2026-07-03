# ShopWeaver MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-only personal Codex plugin that safely reads one Etsy shop and manages draft listings without exposing secrets or enabling publish, delete, customer-contact, fulfillment, advertising, cancellation, or refund operations.

**Architecture:** The repository is the plugin root. A local TypeScript MCP server communicates over stdio, reads credentials and OAuth tokens through a credential-store interface backed by macOS Keychain, and calls a narrowly scoped Etsy Open API client. Read tools return minimized models; every write is draft-only and uses a short-lived, single-use preview record whose canonical payload hash must match the confirmed request.

**Tech Stack:** Node.js 22, TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest, native `fetch`, macOS `security`, Etsy Open API v3, GitHub Actions, Gitleaks.

---

## Fixed safety rules

- Support macOS only in version one.
- Accept Etsy credentials only through masked terminal prompts; never through MCP arguments, command-line arguments, committed environment files, or logs.
- Store the keystring, shared secret, access token, refresh token, expiry, shop ID, and granted scopes in macOS Keychain. Tests use an in-memory credential store.
- Connect exactly one Etsy shop.
- Request only `shops_r listings_r listings_w transactions_r`.
- Treat every write as preview-first, confirmation-required, single-use, and draft-only.
- Re-fetch listing state immediately before each confirmed update or image upload.
- Never automatically retry write requests.
- Expose no tools for publishing, activation, deletion, ads, refunds, cancellations, shipments, messages, or email.
- Never retrieve or return buyer email, address, payment details, or message content.
- Use `max_variations_supported=3` for inventory reads and writes so the client handles Etsy's current three-variation model.
- Do not run the live-verification task until Etsy approves the developer application and the user explicitly authorizes the supervised write.

## External contracts to verify during implementation

- Etsy OAuth and PKCE: <https://developers.etsy.com/documentation/essentials/authentication/>
- Etsy local callback example: <https://developers.etsy.com/documentation/tutorials/quickstart/>
- Etsy request headers and API host: <https://developers.etsy.com/documentation/essentials/requests/>
- Etsy endpoint schemas: <https://developers.etsy.com/documentation/reference/>
- Etsy listing/image workflow: <https://developers.etsy.com/documentation/tutorials/listings/>
- Etsy rate limits: <https://developers.etsy.com/documentation/essentials/rate-limits/>
- Etsy three-variation migration: <https://developers.etsy.com/documentation/tutorials/third-variation/>

Before coding an Etsy endpoint, compare the request and response fields in this plan with the live reference. If Etsy changed a field, update the narrow local schema and its fixture together; do not broaden the tool's capabilities.

## File map

```text
.codex-plugin/plugin.json             Plugin identity and Codex presentation metadata
.mcp.json                             Local stdio MCP server registration
.github/workflows/ci.yml              Build, tests, and secret scanning
skills/shopweaver/SKILL.md            Setup, tool usage, and mandatory safety workflow
src/index.ts                          Stdio entry point and dependency wiring
src/server.ts                         MCP server construction and tool registration
src/config.ts                         Non-secret constants, scopes, callback URI, and service names
src/errors.ts                         Sanitized public error types
src/redaction.ts                      Recursive secret/PII redaction for logs and errors
src/credentials/types.ts              CredentialStore and stored-record contracts
src/credentials/memory.ts             Test credential store
src/credentials/keychain.ts           macOS `security` adapter
src/oauth/pkce.ts                     State/verifier/challenge generation
src/oauth/callback.ts                 One-use localhost callback listener
src/oauth/etsy-oauth.ts               Authorization, token exchange, and refresh
src/setup.ts                           Masked interactive connection command
src/etsy/schemas.ts                   Narrow Etsy response schemas and public output models
src/etsy/client.ts                    Authenticated Etsy HTTP client and retry rules
src/etsy/listings.ts                  Shop/listing/draft/image/inventory operations
src/etsy/orders.ts                    Minimized receipt-to-order-summary mapping
src/writes/canonical.ts               Stable serialization and SHA-256 hashing
src/writes/confirmations.ts           Expiring, single-use preview records
src/tools/read-tools.ts               Connection/shop/listing/order tool handlers
src/tools/write-tools.ts              Preview/confirm draft tool handlers
tests/fixtures/*.json                 Synthetic Etsy responses only
tests/**/*.test.ts                    Unit and MCP integration tests
scripts/check-forbidden-tools.mjs     Static safety-boundary check
README.md                             Setup, supported operations, disclaimer, and usage
SECURITY.md                           Secret handling and vulnerability reporting
PRIVACY.md                            Local processing and minimized Etsy data
TERMS.md                              Noncommercial, non-endorsed project terms
.env.example                          Non-secret callback configuration example only
.gitignore                            Local/build/test exclusions
LICENSE                               MIT license
```

### Task 1: Scaffold the TypeScript plugin and test harness

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.codex-plugin/plugin.json`
- Create: `.mcp.json`
- Create: `src/index.ts`
- Create: `src/server.ts`
- Create: `tests/server.test.ts`

- [ ] **Step 1: Verify the implementation runtime prerequisite**

Run:

```bash
node --version
```

Expected: `v22.x.x` or newer. If Node is unavailable, install Node 22 before continuing; do not substitute an older runtime.

- [ ] **Step 2: Initialize the package and install the minimal dependencies**

Run:

```bash
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install --save-dev @types/node typescript tsx vitest
```

Expected: `package-lock.json` is created and `npm audit` reports no unresolved critical vulnerability.

- [ ] **Step 3: Define the package scripts and compiler contract**

Preserve the dependency versions written by `npm install` and set the remaining package fields with:

```bash
npm pkg set name=shopweaver-mcp version=0.1.0 private=false type=module
npm pkg set engines.node='>=22'
npm pkg set bin.shopweaver-setup=dist/setup.js
npm pkg set scripts.build='tsc -p tsconfig.json'
npm pkg set scripts.dev='tsx src/index.ts'
npm pkg set scripts.setup='tsx src/setup.ts'
npm pkg set scripts.test='vitest run'
npm pkg set scripts.test:watch='vitest'
npm pkg set scripts.check:safety='node scripts/check-forbidden-tools.mjs'
npm pkg set scripts.verify='npm run build && npm test && npm run check:safety'
```

Commit the lockfile. Use this `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true
  }
});
```

Create the initial `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
```

- [ ] **Step 4: Write the failing MCP smoke test**

Create `tests/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

describe("createServer", () => {
  it("identifies the server without connecting to Etsy", () => {
    const server = createServer({} as never);
    expect(server).toBeDefined();
  });
});
```

Run:

```bash
npm test -- tests/server.test.ts
```

Expected: FAIL because `src/server.ts` does not exist.

- [ ] **Step 5: Implement the minimal server and stdio entry point**

Create `src/server.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ServerDependencies {}

export function createServer(_dependencies: ServerDependencies): McpServer {
  return new McpServer({ name: "shopweaver-mcp", version: "0.1.0" });
}
```

Create `src/index.ts`:

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const server = createServer({});
await server.connect(new StdioServerTransport());
```

- [ ] **Step 6: Create the plugin manifests**

Create `.codex-plugin/plugin.json` with the required validated fields and no Etsy artwork:

```json
{
  "name": "shopweaver-mcp",
  "version": "0.1.0",
  "description": "Safely manage one Etsy shop's draft listings from Codex.",
  "author": {
    "name": "Aidan Fu",
    "url": "https://github.com/AidanFu"
  },
  "homepage": "https://github.com/AidanFu/shopweaver-mcp",
  "repository": "https://github.com/AidanFu/shopweaver-mcp",
  "license": "MIT",
  "keywords": ["etsy", "seller", "draft-listings", "mcp"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "ShopWeaver MCP",
    "shortDescription": "Safely manage Etsy draft listings",
    "longDescription": "Read one Etsy shop and create or edit draft listings through preview-first, confirmation-required tools.",
    "developerName": "Aidan Fu",
    "category": "Productivity",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://github.com/AidanFu/shopweaver-mcp",
    "privacyPolicyURL": "https://github.com/AidanFu/shopweaver-mcp/blob/main/PRIVACY.md",
    "termsOfServiceURL": "https://github.com/AidanFu/shopweaver-mcp/blob/main/TERMS.md",
    "defaultPrompt": [
      "Show my Etsy draft listings",
      "Preview a new Etsy draft listing",
      "Summarize recent Etsy orders"
    ],
    "brandColor": "#315C4C"
  }
}
```

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "shopweaver": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "."
    }
  }
}
```

Create `.env.example` with non-secret configuration only:

```dotenv
SHOPWEAVER_REDIRECT_URI=http://localhost:3003/oauth/redirect
```

- [ ] **Step 7: Verify and commit the scaffold**

Run:

```bash
npm run build
npm test -- tests/server.test.ts
python3 /Users/lf595r/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

Expected: build passes, one test passes, and the plugin validator reports success.

Commit:

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example .codex-plugin/plugin.json .mcp.json src/index.ts src/server.ts tests/server.test.ts
git commit -m "build: scaffold ShopWeaver MCP plugin"
```

### Task 2: Implement credential boundaries and redaction

**Files:**
- Create: `src/config.ts`
- Create: `src/errors.ts`
- Create: `src/redaction.ts`
- Create: `src/credentials/types.ts`
- Create: `src/credentials/memory.ts`
- Create: `src/credentials/keychain.ts`
- Create: `tests/credentials.test.ts`
- Create: `tests/redaction.test.ts`

- [ ] **Step 1: Write failing credential and redaction tests**

Create tests that assert the interface stores records without exposing them and removes sensitive keys recursively:

```ts
import { describe, expect, it } from "vitest";
import { MemoryCredentialStore } from "../src/credentials/memory.js";
import { redact } from "../src/redaction.js";

describe("credential boundary", () => {
  it("round-trips a stored token record", async () => {
    const store = new MemoryCredentialStore();
    await store.set("oauth", { accessToken: "secret", refreshToken: "refresh", expiresAt: 10 });
    expect(await store.get("oauth")).toEqual({ accessToken: "secret", refreshToken: "refresh", expiresAt: 10 });
  });

  it("redacts secrets and buyer fields recursively", () => {
    expect(redact({ access_token: "a", nested: { email: "x@y.test", authorization: "Bearer z" } }))
      .toEqual({ access_token: "[REDACTED]", nested: { email: "[REDACTED]", authorization: "[REDACTED]" } });
  });
});
```

Run `npm test -- tests/credentials.test.ts tests/redaction.test.ts`.

Expected: FAIL because the modules do not exist.

- [ ] **Step 2: Define exact stored records**

In `src/credentials/types.ts`, define:

```ts
export type CredentialKey = "app" | "oauth" | "shop";
export type StoredRecords = {
  app: { keystring: string; sharedSecret: string; redirectUri: string };
  oauth: { accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] };
  shop: { userId: number; shopId: number };
};

export interface CredentialStore {
  get<K extends CredentialKey>(key: K): Promise<StoredRecords[K] | null>;
  set<K extends CredentialKey>(key: K, value: StoredRecords[K]): Promise<void>;
  delete(key: CredentialKey): Promise<void>;
}
```

Implement `MemoryCredentialStore` with a private `Map<CredentialKey, string>` and JSON serialization so tests exercise the same serialization boundary as Keychain.

- [ ] **Step 3: Implement macOS Keychain storage**

In `src/config.ts`, export:

```ts
export const KEYCHAIN_SERVICE = "com.aidanfu.shopweaver-mcp";
export const ETSY_SCOPES = ["shops_r", "listings_r", "listings_w", "transactions_r"] as const;
export const DEFAULT_REDIRECT_URI = "http://localhost:3003/oauth/redirect";
```

Implement `KeychainCredentialStore` by invoking `/usr/bin/security` with `spawn`, never with a shell:

```ts
spawn("/usr/bin/security", ["add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", key, "-w", JSON.stringify(value)], {
  stdio: ["ignore", "pipe", "pipe"]
});
```

Use `find-generic-password -s com.aidanfu.shopweaver-mcp -a app -w` for an app-record read and the same shape with accounts `oauth` or `shop`; use `delete-generic-password` with the same service and account for deletes. Build arguments from the fixed service constant and the `CredentialKey` union, not from arbitrary user input. Treat exit code `44` as a missing item. Reject construction unless `process.platform === "darwin"`. Public errors may name the failed Keychain operation but must not include stdout, stderr, command arguments, or stored JSON.

- [ ] **Step 4: Implement recursive redaction and public errors**

Redact keys case-insensitively when they contain `token`, `secret`, `authorization`, `cookie`, `code`, `email`, `address`, `payment`, or `message`. Also replace any registered runtime secret appearing inside a string. Define `ShopWeaverError` with a stable public `code` and sanitized `message`; preserve the original cause only as non-enumerable internal state.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm test -- tests/credentials.test.ts tests/redaction.test.ts
npm run build
```

Expected: all tests pass and TypeScript reports no errors.

Commit:

```bash
git add src/config.ts src/errors.ts src/redaction.ts src/credentials tests/credentials.test.ts tests/redaction.test.ts
git commit -m "feat: add Keychain credential boundary"
```

### Task 3: Implement OAuth PKCE and the interactive setup command

**Files:**
- Create: `src/oauth/pkce.ts`
- Create: `src/oauth/callback.ts`
- Create: `src/oauth/etsy-oauth.ts`
- Create: `src/setup.ts`
- Create: `tests/oauth.test.ts`

- [ ] **Step 1: Write failing OAuth tests**

Test all of these behaviors with a local fake token endpoint and `MemoryCredentialStore`:

```ts
it("creates an RFC 7636 S256 challenge from a verifier");
it("rejects a callback whose state does not match");
it("exchanges a code using the same redirect URI and verifier");
it("stores token expiry as Date.now() plus expires_in seconds");
it("extracts the numeric user id prefix from the Etsy access token");
it("requests exactly shops_r listings_r listings_w transactions_r");
it("closes the callback server after success, denial, or timeout");
```

Run `npm test -- tests/oauth.test.ts`.

Expected: FAIL because the OAuth modules do not exist.

- [ ] **Step 2: Implement PKCE and state generation**

Use `randomBytes(32).toString("base64url")` for both the verifier and OAuth state. Compute the challenge as `createHash("sha256").update(verifier).digest("base64url")`. Do not log any of these values.

- [ ] **Step 3: Implement the one-use callback**

Parse the configured redirect URI and bind only its hostname and port. Accept only the configured pathname and GET method. Validate `state` with `timingSafeEqual`; reject duplicate callbacks; return a plain success/failure HTML response without echoing parameters; close after the first terminal response or five minutes.

- [ ] **Step 4: Implement Etsy authorization and token exchange**

Build the authorization URL at `https://www.etsy.com/oauth/connect` with `response_type=code`, the keystring, exact redirect URI, space-separated fixed scopes, state, and S256 challenge. Exchange with form-encoded POST to `https://api.etsy.com/v3/public/oauth/token`. Parse only:

```ts
const EtsyTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive()
});
```

Derive `userId` from the digits before the first `.` in `access_token`. Store the OAuth record only after schema validation succeeds.

- [ ] **Step 5: Implement masked setup input and browser launch**

In `src/setup.ts`, reject non-macOS platforms. Prompt separately for the keystring and shared secret using raw terminal mode so typed characters are replaced by `*` and never retained after each answer is submitted. Prompt for the registered redirect URI, defaulting to `http://localhost:3003/oauth/redirect`. Store the app record, start the callback, and launch the authorization URL with:

```ts
spawn("/usr/bin/open", [authorizationUrl.toString()], { stdio: "ignore", detached: true }).unref();
```

After token exchange, call `GET /v3/application/users/{user_id}/shops`, require exactly one shop, and store its `shop_id`. If zero or multiple shops are returned, store no shop record and print a sanitized actionable message.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- tests/oauth.test.ts
npm run build
```

Expected: all OAuth tests pass without opening a real browser or touching Keychain.

Commit:

```bash
git add src/oauth src/setup.ts tests/oauth.test.ts
git commit -m "feat: add secure Etsy OAuth setup"
```

### Task 4: Build the authenticated Etsy client

**Files:**
- Create: `src/etsy/schemas.ts`
- Create: `src/etsy/client.ts`
- Create: `tests/etsy-client.test.ts`
- Create: `tests/fixtures/rate-limit.json`

- [ ] **Step 1: Write failing HTTP-policy tests**

Cover:

```ts
it("adds x-api-key and bearer authorization without exposing either value");
it("refreshes once when the token expires within sixty seconds");
it("replaces both access and refresh tokens after refresh");
it("retries GET on 429 and transient 5xx at most twice");
it("uses Retry-After when present");
it("never retries POST or PUT");
it("maps 401 to an AUTH_REQUIRED public error");
it("returns RATE_LIMITED with a safe retry time after retries are exhausted");
it("rejects an Etsy response that fails its narrow Zod schema");
```

Inject `fetch`, `sleep`, `now`, and `CredentialStore` into the client so tests are deterministic. Run `npm test -- tests/etsy-client.test.ts`; expect failure.

- [ ] **Step 2: Implement refresh and request policy**

Use `https://api.etsy.com/v3` as the base. Every application request includes `x-api-key: keystring:sharedSecret` and `Authorization: Bearer accessToken`. Refresh with form fields `grant_type=refresh_token`, `client_id`, and `refresh_token`. Serialize refreshes through one in-flight promise so concurrent reads cannot race token replacement.

For GET only, retry network errors, 429, 502, 503, and 504 twice with delays of 250 ms then 750 ms, overridden by a bounded `Retry-After` value up to 60 seconds. Do not retry any POST, PUT, PATCH, or DELETE. No DELETE method should be exposed by the client API.

- [ ] **Step 3: Add narrow common schemas**

Define `Money`, paginated result, shop, listing state, listing summary, listing detail, inventory, image upload, and receipt schemas with `.strip()` so unneeded Etsy fields are discarded. Define public output types separately; never pass parsed raw objects directly to MCP handlers.

- [ ] **Step 4: Verify and commit**

Run `npm test -- tests/etsy-client.test.ts && npm run build`.

Expected: all client tests pass.

Commit:

```bash
git add src/etsy/schemas.ts src/etsy/client.ts tests/etsy-client.test.ts tests/fixtures/rate-limit.json
git commit -m "feat: add authenticated Etsy API client"
```

### Task 5: Add connection, shop, and listing read tools

**Files:**
- Create: `src/etsy/listings.ts`
- Create: `src/tools/read-tools.ts`
- Modify: `src/server.ts`
- Create: `tests/read-tools.test.ts`
- Create: `tests/fixtures/shop.json`
- Create: `tests/fixtures/listings.json`
- Create: `tests/fixtures/listing.json`
- Create: `tests/fixtures/inventory-three-variations.json`

- [ ] **Step 1: Write failing handler tests**

Assert:

```ts
it("reports booleans and granted scopes but no secret values");
it("returns only the connected shop's id, name, title, currency, and listing counts");
it("lists only the connected shop and supports active, draft, inactive, expired, and sold_out filters");
it("caps listing page size at 100");
it("returns operational listing fields and normalized money");
it("preserves all three inventory variation dimensions");
it("rejects a shop id supplied by a caller because shop id is not a tool input");
```

Run `npm test -- tests/read-tools.test.ts`; expect failure.

- [ ] **Step 2: Implement narrow listing operations**

Implement:

```ts
getShop(): Promise<PublicShop>
listListings(input: { state?: ListingState; limit?: number; offset?: number }): Promise<Page<PublicListingSummary>>
getListing(input: { listingId: number }): Promise<PublicListingDetail>
getListingInventory(listingId: number): Promise<PublicInventory>
```

Always take `shopId` from the credential store. For inventory requests include `max_variations_supported=3` where the live reference accepts it. Normalize Etsy `Money` to `{ amount: string, currency: string }` using the divisor; never use binary floating-point for outgoing prices.

- [ ] **Step 3: Register the four read tools**

Register exactly:

```text
etsy_connection_status
etsy_get_shop
etsy_list_listings
etsy_get_listing
```

Descriptions must state that all results apply to the one connected shop. Use Zod inputs with `.strict()`. `etsy_connection_status` and `etsy_get_shop` accept an empty object. Return JSON text content and `structuredContent` containing the same public model.

- [ ] **Step 4: Verify tool schemas and commit**

Run:

```bash
npm test -- tests/read-tools.test.ts tests/server.test.ts
npm run build
```

Expected: tests pass and the tool list contains only these four tools at this milestone.

Commit:

```bash
git add src/etsy/listings.ts src/tools/read-tools.ts src/server.ts tests/read-tools.test.ts tests/fixtures
git commit -m "feat: add Etsy shop and listing reads"
```

### Task 6: Implement the preview-confirmation protocol

**Files:**
- Create: `src/writes/canonical.ts`
- Create: `src/writes/confirmations.ts`
- Create: `tests/confirmations.test.ts`

- [ ] **Step 1: Write failing confirmation tests**

Cover:

```ts
it("hashes objects identically regardless of key insertion order");
it("distinguishes arrays with different order");
it("issues an opaque random token bound to action, shop, target, and payload hash");
it("expires a preview after ten minutes");
it("rejects payload changes between preview and confirmation");
it("consumes a token before invoking the write callback");
it("does not permit token reuse after a failed or successful write");
```

Run `npm test -- tests/confirmations.test.ts`; expect failure.

- [ ] **Step 2: Implement canonical hashing**

Recursively sort object keys, preserve array order, reject `undefined`, non-finite numbers, functions, symbols, and bigint, then hash the UTF-8 JSON with SHA-256. Prices must already be normalized decimal strings before hashing.

- [ ] **Step 3: Implement in-memory confirmation records**

Use:

```ts
type WriteAction = "create_draft" | "update_draft" | "upload_draft_image" | "update_draft_inventory";
type PreviewRecord = {
  action: WriteAction;
  shopId: number;
  listingId?: number;
  payloadHash: string;
  expiresAt: number;
};
```

Generate 32-byte base64url tokens. Store only the token and record in a private `Map`; never persist them. On confirmation, atomically remove the record before validating or calling Etsy. Return `CONFIRMATION_REQUIRED`, `CONFIRMATION_EXPIRED`, or `PREVIEW_MISMATCH` without returning expected hashes or payloads.

- [ ] **Step 4: Verify and commit**

Run `npm test -- tests/confirmations.test.ts && npm run build`; expect all tests to pass.

Commit:

```bash
git add src/writes tests/confirmations.test.ts
git commit -m "feat: add write preview confirmations"
```

### Task 7: Add draft creation and field updates

**Files:**
- Create: `src/tools/write-tools.ts`
- Modify: `src/etsy/listings.ts`
- Modify: `src/server.ts`
- Create: `tests/draft-tools.test.ts`
- Create: `tests/fixtures/draft-listing.json`

- [ ] **Step 1: Write failing draft-write tests**

Test:

```ts
it("previews a normalized draft without sending a write request");
it("requires title, description, quantity, price, who_made, when_made, taxonomy_id, and type");
it("rejects state, active, publish, delete, shop_id, and user_id input fields");
it("creates a draft only with a matching single-use confirmation token");
it("does not send state=active in any request");
it("reports an uncertain create result and prevents immediate retry with the same token");
it("re-fetches listing state immediately before an update");
it("rejects an update when Etsy reports a non-draft state");
it("allows only title, description, tags, materials, taxonomy_id, who_made, when_made, type, and readiness_state_id updates");
```

Run `npm test -- tests/draft-tools.test.ts`; expect failure.

- [ ] **Step 2: Define strict write schemas**

Use a shared envelope:

```ts
const WriteEnvelope = z.object({
  mode: z.enum(["preview", "confirm"]).default("preview"),
  confirmationToken: z.string().min(20).optional()
}).strict();
```

Compose it with explicit draft fields. On `preview`, reject `confirmationToken`. On `confirm`, require it and re-normalize the complete payload before checking the preview. Do not include `state` in the accepted schema or outgoing body.

- [ ] **Step 3: Implement draft creation**

Preview returns:

```ts
{
  operation: "create_draft",
  shopId,
  changes: normalizedPayload,
  confirmationToken,
  expiresAt,
  warning: "This will create a new Etsy draft. It will not publish the listing."
}
```

Confirm posts once to `/v3/application/shops/{shop_id}/listings`. If the network fails after request dispatch or the response cannot establish success/failure, throw `CREATE_RESULT_UNCERTAIN` with the instruction to inspect Etsy drafts before making another attempt. Never reissue the POST automatically.

- [ ] **Step 4: Implement draft field updates**

Preview fetches the current listing, requires `state === "draft"`, and returns old/new values. Confirm consumes the token, fetches current state again, requires `draft`, verifies the payload hash, then sends one update request. A changed remote field does not authorize a broader update; send only the confirmed fields.

- [ ] **Step 5: Register the two tools**

Register exactly:

```text
etsy_create_draft_listing
etsy_update_draft_listing
```

Tool descriptions must say: preview is the default, confirmation is required, and the tool cannot publish or modify active listings.

- [ ] **Step 6: Verify and commit**

Run `npm test -- tests/draft-tools.test.ts && npm run build`; expect all tests to pass.

Commit:

```bash
git add src/tools/write-tools.ts src/etsy/listings.ts src/server.ts tests/draft-tools.test.ts tests/fixtures/draft-listing.json
git commit -m "feat: add previewed draft listing writes"
```

### Task 8: Add draft image uploads

**Files:**
- Modify: `src/tools/write-tools.ts`
- Modify: `src/etsy/listings.ts`
- Create: `tests/image-tool.test.ts`
- Create: `tests/fixtures/product-image.jpg`

- [ ] **Step 1: Write failing image safety tests**

Cover:

```ts
it("requires an absolute local path to a regular jpg, png, gif, or webp file");
it("hashes the image bytes during preview");
it("does not copy the image into the repository");
it("re-hashes the image and rejects changed bytes during confirmation");
it("re-fetches listing state and rejects non-draft targets");
it("uploads multipart field image only once after confirmation");
it("does not expose local file bytes or OAuth data in the result");
```

Run `npm test -- tests/image-tool.test.ts`; expect failure.

- [ ] **Step 2: Implement the image preview**

Resolve the user path, require `path.isAbsolute`, use `lstat` to reject symlinks and non-regular files, cap size at Etsy's current documented maximum, detect the supported image type from file signature, and compute SHA-256 over the bytes. Bind the preview record to listing ID, absolute path, byte hash, rank, and overwrite flag. Return metadata only: filename, size, detected type, listing ID, and warning.

- [ ] **Step 3: Implement confirmed upload**

Consume the confirmation, verify the file again, re-fetch the listing and require `draft`, then build `FormData` with a `Blob` under field `image`. POST once to `/v3/application/shops/{shop_id}/listings/{listing_id}/images`. Return only listing image ID, rank, width, height, and safe image URL fields permitted by the narrow schema.

- [ ] **Step 4: Register, verify, and commit**

Register `etsy_upload_draft_image`, then run:

```bash
npm test -- tests/image-tool.test.ts
npm run build
```

Expected: all tests pass.

Commit:

```bash
git add src/tools/write-tools.ts src/etsy/listings.ts tests/image-tool.test.ts tests/fixtures/product-image.jpg
git commit -m "feat: add confirmed draft image upload"
```

### Task 9: Add draft inventory, SKU, variation, quantity, and price updates

**Files:**
- Modify: `src/etsy/schemas.ts`
- Modify: `src/etsy/listings.ts`
- Modify: `src/tools/write-tools.ts`
- Create: `tests/inventory-tool.test.ts`
- Create: `tests/fixtures/inventory-three-variations.json`

- [ ] **Step 1: Write failing inventory tests**

Cover:

```ts
it("round-trips three property-value dimensions without dropping one");
it("uses decimal price strings and Etsy money divisors without floating-point rounding");
it("previews every product, offering, sku, quantity, enabled flag, and price change");
it("requires a complete replacement inventory payload accepted by Etsy");
it("rejects negative quantity, blank SKU, invalid currency, and malformed property values");
it("re-fetches draft state and current inventory immediately before confirmation");
it("includes max_variations_supported=3 on the write when supported by the live reference");
it("sends one PUT and never retries it");
```

Run `npm test -- tests/inventory-tool.test.ts`; expect failure.

- [ ] **Step 2: Define the complete inventory input**

Model Etsy's `products[]`, each with `sku`, `property_values[]`, and `offerings[]`. An offering includes `quantity`, `is_enabled`, and a decimal `price`; include `readiness_state_id` only when provided. Validate at most three property dimensions and preserve Etsy IDs required by the live update schema.

- [ ] **Step 3: Implement preview and confirmation**

Preview fetches current listing and inventory, requires `draft`, computes a structured diff, and hashes the full normalized outgoing inventory. Confirm consumes the token, re-fetches state, requires `draft`, then sends one PUT to `/v3/application/listings/{listing_id}/inventory` with `max_variations_supported=3` when present in the live API. Return the normalized updated inventory, not the raw Etsy response.

- [ ] **Step 4: Register, verify, and commit**

Register `etsy_update_draft_inventory`, then run:

```bash
npm test -- tests/inventory-tool.test.ts
npm run build
```

Expected: all tests pass.

Commit:

```bash
git add src/etsy/schemas.ts src/etsy/listings.ts src/tools/write-tools.ts tests/inventory-tool.test.ts tests/fixtures/inventory-three-variations.json
git commit -m "feat: add confirmed draft inventory updates"
```

### Task 10: Add minimized order summaries

**Files:**
- Create: `src/etsy/orders.ts`
- Modify: `src/etsy/schemas.ts`
- Modify: `src/tools/read-tools.ts`
- Modify: `src/server.ts`
- Create: `tests/order-tools.test.ts`
- Create: `tests/fixtures/receipts.json`

- [ ] **Step 1: Create a synthetic receipt fixture containing forbidden PII**

The fixture must use fake values and include `name`, `first_line`, `second_line`, `city`, `state`, `zip`, `country_iso`, `email`, `payment_method`, and `message_from_buyer` alongside receipt ID, status, timestamps, totals, and transaction titles/quantities. This proves minimization rather than relying on an already-sanitized fixture.

- [ ] **Step 2: Write failing minimization tests**

Assert the public result is exactly:

```ts
{
  orderId: number,
  status: string,
  createdAt: string,
  updatedAt: string,
  items: Array<{ title: string; quantity: number }>,
  total: { amount: string; currency: string }
}
```

Also assert `JSON.stringify(result)` contains none of the fake name, address, email, payment, or message values, and that the input schema exposes only `limit`, `offset`, `minCreated`, and `maxCreated`.

Run `npm test -- tests/order-tools.test.ts`; expect failure.

- [ ] **Step 3: Implement receipts mapping and register the tool**

Call `/v3/application/shops/{shop_id}/receipts` with the connected shop ID and bounded pagination/date filters. Parse only the fields required for the summary plus synthetic forbidden fields used to prove they are stripped. Register `etsy_list_order_summaries`; do not register receipt-detail or transaction-detail tools.

- [ ] **Step 4: Verify and commit**

Run `npm test -- tests/order-tools.test.ts && npm run build`; expect all tests to pass.

Commit:

```bash
git add src/etsy/orders.ts src/etsy/schemas.ts src/tools/read-tools.ts src/server.ts tests/order-tools.test.ts tests/fixtures/receipts.json
git commit -m "feat: add minimized Etsy order summaries"
```

### Task 11: Enforce the tool boundary and full integration behavior

**Files:**
- Create: `scripts/check-forbidden-tools.mjs`
- Create: `tests/mcp-integration.test.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write the expected tool allowlist integration test**

Connect an in-memory MCP client to the server and assert the sorted tool names equal:

```ts
[
  "etsy_connection_status",
  "etsy_create_draft_listing",
  "etsy_get_listing",
  "etsy_get_shop",
  "etsy_list_listings",
  "etsy_list_order_summaries",
  "etsy_update_draft_inventory",
  "etsy_update_draft_listing",
  "etsy_upload_draft_image"
]
```

Exercise one read and one preview-confirm flow through MCP serialization, including a mismatched confirmation. Run `npm test -- tests/mcp-integration.test.ts`; expect failure until dependency wiring is complete.

- [ ] **Step 2: Finish dependency wiring**

Construct `KeychainCredentialStore`, `EtsyOAuth`, `EtsyClient`, `ListingService`, `OrderService`, and `ConfirmationStore` once in `src/index.ts`; inject them into `createServer`; register read and write tools. Do not create global clients inside handlers.

- [ ] **Step 3: Add the static forbidden-operation check**

Create `scripts/check-forbidden-tools.mjs` that reads `src/tools`, `src/server.ts`, `.mcp.json`, and `skills/shopweaver/SKILL.md`, extracts every `etsy_` tool name, compares it with the exact allowlist above, and fails if any identifier contains `publish`, `activate`, `delete`, `advert`, `refund`, `cancel`, `shipment`, `message`, or `email` outside explanatory prose in the skill. The script must print only filenames and forbidden identifiers, never file contents.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run verify
```

Expected: TypeScript passes, all tests pass, and the safety script prints `ShopWeaver tool allowlist verified.`

Commit:

```bash
git add src/index.ts src/server.ts scripts/check-forbidden-tools.mjs tests/mcp-integration.test.ts
git commit -m "test: enforce ShopWeaver MCP safety boundary"
```

### Task 12: Add user documentation, legal files, and the Codex skill

**Files:**
- Create: `skills/shopweaver/SKILL.md`
- Create: `README.md`
- Create: `SECURITY.md`
- Create: `PRIVACY.md`
- Create: `TERMS.md`
- Create: `LICENSE`
- Create: `.github/workflows/ci.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Write the ShopWeaver skill**

The skill frontmatter name is `shopweaver` and its description triggers on reading an Etsy shop, listing drafts, uploading draft images, changing draft price/inventory, or summarizing Etsy orders. The body must require this workflow:

```text
1. Run etsy_connection_status before Etsy work.
2. Never ask the user to paste credentials or tokens into chat.
3. For writes, call preview mode and show the complete normalized changes and warning.
4. Ask for explicit confirmation only after the preview is visible.
5. Confirm with the unchanged payload and returned confirmation token.
6. Stop if the listing is not draft or the confirmation expires/mismatches.
7. Never claim the plugin can publish, delete, advertise, refund, cancel, ship, message, or email.
```

- [ ] **Step 2: Write README setup and usage**

Document Node 22, macOS, Etsy developer application registration, exact callback URI registration, `npm ci`, `npm run build`, `npm run setup`, plugin installation, and each of the nine tool names. State that Etsy application approval is external and that live writes are blocked until approval. Include prominently and verbatim:

> The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.

Document that `.env.example` contains no secrets and Etsy credentials must only be entered into the masked setup prompt.

- [ ] **Step 3: Write security, privacy, terms, license, and ignore rules**

`SECURITY.md` documents Keychain storage, redaction, no-write-retry behavior, responsible disclosure, and prohibited secret sharing. `PRIVACY.md` documents local processing, transient Etsy responses, non-persistence of product images/order data, and excluded customer fields. `TERMS.md` documents personal noncommercial use, no Etsy endorsement, user responsibility, and Etsy API terms. Use the standard MIT license text in `LICENSE`.

Add to `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
```

- [ ] **Step 4: Add CI and secret scanning**

Create `.github/workflows/ci.yml` with read-only permissions, `actions/checkout`, `actions/setup-node` for Node 22 with npm cache, `npm ci`, `npm run verify`, and `gitleaks/gitleaks-action`. Do not add Etsy secrets to workflow inputs or repository variables.

- [ ] **Step 5: Validate docs and commit**

Run:

```bash
npm run verify
python3 /Users/lf595r/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
rg -n "Etsy.*trademark|not endorsed or certified" README.md TERMS.md
rg -n "publish|delete|advert|refund|cancel|shipment|message|email" README.md skills/shopweaver/SKILL.md
```

Expected: verification and plugin validation pass; the disclaimer appears; prohibited operations appear only in explicit statements that they are unsupported.

Commit:

```bash
git add skills README.md SECURITY.md PRIVACY.md TERMS.md LICENSE .github/workflows/ci.yml .gitignore
git commit -m "docs: add ShopWeaver safety and setup guidance"
```

### Task 13: Final automated verification and release-readiness audit

**Files:**
- Modify only files implicated by a failing check

- [ ] **Step 1: Run the full local verification**

Run:

```bash
npm ci
npm run verify
```

Expected: clean install, build, all tests, and safety allowlist pass.

- [ ] **Step 2: Audit repository contents for accidental secrets or real Etsy data**

Run:

```bash
git ls-files
git grep -n -I -E '(access[_-]?token|refresh[_-]?token|shared[_-]?secret|Authorization: Bearer|x-api-key)' -- ':!docs/superpowers/**' ':!README.md' ':!SECURITY.md' ':!src/redaction.ts' ':!tests/**'
```

Expected: tracked files are intentional; the grep returns no credential values. Field names in typed code/tests are acceptable only when values are synthetic and obvious.

- [ ] **Step 3: Confirm the public tool boundary**

Run:

```bash
npm run check:safety
```

Expected: exactly `ShopWeaver tool allowlist verified.`

- [ ] **Step 4: Confirm a clean worktree and commit only necessary audit fixes**

Run `git status --short`.

Expected: empty output. If the audit required a fix, rerun `npm run verify`, commit only that fix with a specific message, and repeat until clean.

### Task 14: Supervised live verification after Etsy approval

**Prerequisite:** Etsy has approved the developer application, the user has explicitly authorized this task, and Tasks 1-13 pass. Do not execute this task while approval is pending.

**Files:**
- Do not create fixtures, logs, screenshots, or repository files containing live Etsy data

- [ ] **Step 1: Connect through the masked setup command**

Run `npm run setup` in the user's terminal. The user enters credentials directly into the masked prompts. Confirm `etsy_connection_status` reports app credentials, OAuth authorization, one shop, and the four expected scopes without revealing values.

- [ ] **Step 2: Run read-only checks**

Call `etsy_get_shop`, `etsy_list_listings` with a small limit, and `etsy_get_listing` for a user-selected listing. Verify outputs contain operational fields only and no customer data.

- [ ] **Step 3: Preview one minimal draft**

Call `etsy_create_draft_listing` in preview mode with user-provided product details. Show the exact normalized payload, warning, expiry, and confirmation token. Do not confirm until the user explicitly accepts this exact preview.

- [ ] **Step 4: Create exactly one draft after explicit confirmation**

Call the same tool in confirm mode with the unchanged payload and token. Do not upload an image or perform any additional live write.

- [ ] **Step 5: Verify manually and stop**

The user verifies the new draft in Etsy Shop Manager. Record only pass/fail and sanitized observations in the conversation, not in repository fixtures. Stop all live writes until the user separately authorizes further testing.

## Self-review results

- Spec coverage: all architecture, authentication, read, draft-write, data-minimization, error, testing, delivery, legal, and supervised-live-verification requirements map to Tasks 1-14.
- Safety coverage: the nine-tool allowlist and prohibited-operation vocabulary are tested statically and through MCP integration.
- Type consistency: stored credentials, public models, write actions, confirmation fields, and tool names use the same identifiers throughout the plan.
- Placeholder scan: there are no deferred implementation markers; dependency versions are written and locked by the exact `npm install` commands in Task 1.
