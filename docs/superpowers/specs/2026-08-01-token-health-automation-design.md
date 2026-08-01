# Token Health Automation Design

## Purpose

Add a safe, reusable connection-health layer so ShopWeaver can validate stored OAuth credentials before marketplace or Drive work starts. The first implementation targets Google Drive because the current end-to-end Etsy variation test is blocked by an expired Google refresh flow. The design must also be reusable for Etsy, Amazon SP-API, Amazon Ads, and eBay later.

## Scope

Included:

- Add a shared token-health result shape that never exposes token values.
- Add Google Drive token validation that can check whether app credentials exist, OAuth credentials exist, the access token is valid or expiring, refresh succeeds, refresh fails, and allowed Drive folders are configured.
- Add `npm run google:status` for local diagnosis without requiring an interactive OAuth setup flow.
- Improve `google_drive_connection_status` to optionally validate refresh.
- Add a Drive import preflight so Drive tools fail early with a clear reconnect action when Google authorization is expired or revoked.
- Keep the structure reusable for Amazon SP-API, Amazon Ads, Etsy, and eBay.

Excluded:

- Reconnecting Google automatically without user OAuth approval.
- Printing or logging access tokens, refresh tokens, client secrets, or Keychain payloads.
- Changing Google Drive folder access scope.
- Implementing Amazon/Etsy/eBay token validation in this first slice.
- Any marketplace writes.

## Result model

The reusable health result should use stable fields:

```ts
type TokenHealthStatus = {
  provider: "google_drive" | "etsy" | "amazon_sp_api" | "amazon_ads" | "ebay";
  connected: boolean;
  credentialsAvailable: boolean;
  authorized: boolean;
  accessTokenStatus: "missing" | "valid" | "expiring" | "expired" | "unknown";
  refreshStatus: "not_needed" | "refreshed" | "failed" | "not_supported" | "skipped";
  expiresAt: string | null;
  scopes: string[];
  nextAction: string | null;
};
```

Google Drive should extend this with:

```ts
allowedFolders: Array<{ id: string; name: string }>;
```

## Google validation behavior

`google_drive_connection_status` should support:

```ts
validateRefresh?: boolean
```

Behavior:

- If Google app credentials are missing:
  - `connected: false`
  - `credentialsAvailable: false`
  - `authorized: false`
  - `nextAction: "Run npm run google:setup to connect Google Drive."`
- If Google OAuth credentials are missing:
  - `connected: false`
  - `credentialsAvailable: true`
  - `authorized: false`
  - same next action
- If token is valid for more than 60 seconds:
  - `connected: true`
  - `accessTokenStatus: "valid"`
  - `refreshStatus: "not_needed"`
- If token expires within 60 seconds or is expired and `validateRefresh` is false:
  - do not call Google
  - report `accessTokenStatus: "expiring"` or `"expired"`
  - `refreshStatus: "skipped"`
  - `nextAction: "Run google_drive_connection_status with validateRefresh=true or run npm run google:status."`
- If token expires within 60 seconds or is expired and `validateRefresh` is true:
  - call the Google refresh endpoint through existing `GoogleOAuth.refresh`
  - if refresh succeeds, store the updated token and report `refreshStatus: "refreshed"`
  - if refresh fails, do not retry in a loop; report `refreshStatus: "failed"` and `nextAction: "Run npm run google:setup to reconnect Google Drive."`

## CLI behavior

Add:

```json
"google:status": "tsx src/google-status.ts"
```

The CLI should:

- run the Google status check with refresh validation enabled
- print JSON only
- never print secrets
- exit `0` when connected
- exit `1` when disconnected or refresh failed

## Drive preflight behavior

Before Drive import/write/image operations, ShopWeaver should run a Google health preflight with refresh validation enabled.

If Google refresh fails, tools should fail before listing or downloading Drive content with a clear message:

```text
Google Drive authorization expired or was revoked. Run npm run google:setup to reconnect Google Drive.
```

This should preserve the current selected-folder privacy boundary. The preflight can list configured allowed folders from local config, but it must not browse the whole Drive.

## Safety constraints

- No token values in command output, MCP tool output, errors, logs, or tests.
- No automatic OAuth browser launch from status checks.
- No new Drive scope.
- No marketplace writes.
- No silent repeated refresh loops.
- Keychain remains the credential store.

## Testing strategy

Automated tests should cover:

- Google status with missing app credentials.
- Google status with missing OAuth credentials.
- Valid access token without refresh.
- Expired access token with `validateRefresh=false`.
- Expired access token with successful refresh.
- Expired access token with failed refresh.
- CLI argument-free behavior via exported runner/parser functions.
- Drive import preflight rejects before Drive folder listing when refresh fails.
- Outputs do not contain token or secret values.
- Full `npm run verify`.

## First live test

After implementation:

1. Run `npm run google:status`.
2. If it reports reconnect required, run `npm run google:setup` once.
3. Run `npm run google:status` again and confirm connected.
4. Re-run the read-only Etsy variation group preview against the allowed `HandMade` folder.
