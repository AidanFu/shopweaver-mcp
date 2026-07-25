# ShopWeaver MCP

ShopWeaver MCP is a personal, noncommercial Codex plugin for managing one Etsy seller account through Etsy Open API v3. It reads shop, listing, and minimized order information and performs preview-first writes to draft listings only.

> The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.

## Current status

The local MCP server and Codex plugin are implemented. Automated verification covers OAuth, Keychain storage, Etsy response parsing, read tools, draft write confirmations, draft image uploads, draft inventory updates, order-summary minimization, and the safety allowlist.

Live Etsy verification has confirmed OAuth connection and read-only shop/listing/order-summary access against one shop. Draft creation remains intentionally manual: preview the exact payload first, then confirm only if the draft should be created in Etsy.

## Safety boundary

ShopWeaver can create drafts, edit supported draft fields, upload draft images, and replace draft inventory. Every write defaults to preview mode, requires explicit confirmation with an unchanged payload, and rechecks remote draft state before updating.

ShopWeaver cannot publish, activate, or delete listings. It has no tools for ads, refunds, cancellations, shipments, Etsy Messages, or customer email. Order summaries exclude buyer email, shipping address, payment details, and messages.

## Requirements

- macOS
- Node.js 22 or newer
- One Etsy shop
- An Etsy developer application with the callback URI registered exactly
- Etsy application approval before live verification
- Terminal access for masked setup prompts

## Install from source

```bash
git clone https://github.com/AidanFu/shopweaver-mcp.git
cd shopweaver-mcp
npm ci
npm run verify
```

For the current development branch in this workspace:

```bash
cd /Users/lf595r/shopweaver-mcp/.worktrees/shopweaver-implementation
npm ci
npm run build
npm run verify
```

The repository root is the Codex plugin root. `.codex-plugin/plugin.json` registers the skill and `.mcp.json` runs `node dist/index.js`. Install the released plugin from its configured Codex marketplace after publication. For source development, configure a local marketplace entry pointing to this repository, then run `codex plugin add shopweaver-mcp@<marketplace-name>`.

## Create and configure the Etsy app

In Etsy Developers, create or edit a personal app for this project. In the app settings, add this callback URL exactly:

```text
http://localhost:3003/oauth/redirect
```

Use `localhost`, not `127.0.0.1`, because Etsy does not allow IP-address callback hosts.

The app credentials page provides:

- `Keystring`: Etsy OAuth client id / API keystring.
- `Shared Secret`: Etsy application secret.

Do not paste either value into Codex chat, Git, shell command arguments, `.env` files, logs, or screenshots.

## Connect Etsy from the terminal

Run setup from the implementation checkout:

```bash
cd /Users/lf595r/shopweaver-mcp/.worktrees/shopweaver-implementation
npm run setup
```

Prompts:

```text
Etsy API keystring:
Etsy shared secret:
Registered redirect URI [http://localhost:3003/oauth/redirect]:
```

Paste the keystring at the first prompt and the shared secret at the second prompt. Press Enter at the redirect prompt if the Etsy app is registered with `http://localhost:3003/oauth/redirect`.

Setup opens Etsy OAuth in the browser. Approve access for the shop account. The browser should show:

```text
ShopWeaver is connected. You may close this window.
```

The terminal should then print:

```text
ShopWeaver connected one Etsy shop.
```

Credentials and OAuth tokens are stored in macOS Keychain under `com.aidanfu.shopweaver-mcp`.

The requested scopes are `shops_r listings_r listings_w transactions_r`.

## macOS Keychain prompts

macOS may show:

```text
security wants to access key "com.aidanfu.shopweaver-mcp" in your keychain
```

Enter the Mac login keychain password, not the Etsy keystring, Etsy shared secret, or Etsy account password. If the keychain is locked, unlock it first:

```bash
security unlock-keychain ~/Library/Keychains/login.keychain-db
```

## Run the MCP server

Build first:

```bash
npm run build
```

Then start the server:

```bash
npm run dev
```

The Codex plugin manifest uses `.mcp.json` to run the built server with stdio transport.

## Tools

- `etsy_connection_status`
- `etsy_get_shop`
- `etsy_list_listings`
- `etsy_get_listing`
- `etsy_list_order_summaries`
- `etsy_create_draft_listing`
- `etsy_update_draft_listing`
- `etsy_upload_draft_image`
- `etsy_update_draft_inventory`

For every write, run preview mode first, inspect the complete normalized payload, then explicitly confirm using the unchanged payload and returned confirmation token.

## Live verification checklist

After setup, verify read-only access first:

1. Run `etsy_connection_status` and confirm credentials, authorization, and shop connection are true.
2. Run `etsy_get_shop` and confirm the expected shop name.
3. Run `etsy_list_listings` with a small limit. A new shop may correctly return zero listings.
4. Run `etsy_list_order_summaries` with a small limit. A new shop may correctly return zero orders.

Only after read-only verification should you test draft creation.

## Draft listing creation flow

Draft creation is intentionally two-step:

1. Preview the draft with `etsy_create_draft_listing`.
2. Inspect every field in the returned payload.
3. Confirm with the returned confirmation token and the unchanged payload.

For a first live test, prefer a harmless digital draft because it avoids shipping-profile and physical processing requirements while still verifying OAuth, write scope, payload validation, preview confirmation, and Etsy draft creation. Do not publish the draft.

Physical drafts may require Etsy shop-specific readiness, processing, taxonomy, shipping, or policy data before Etsy accepts them.

## Troubleshooting

### `npm run setup` cannot find `package.json`

You are in the design/docs workspace. Run setup from the implementation checkout:

```bash
cd /Users/lf595r/shopweaver-mcp/.worktrees/shopweaver-implementation
npm run setup
```

### Etsy says the app is not recognized

Check that:

- The keystring is copied from the Etsy app's `Keystring` field.
- The callback URL is registered exactly as `http://localhost:3003/oauth/redirect`.
- The Etsy app is active for personal access or approved for the intended use.

### Setup cannot store credentials in Keychain

Unlock the login keychain:

```bash
security unlock-keychain ~/Library/Keychains/login.keychain-db
```

Then rerun setup.

### `SHOP_NOT_CONNECTED`

OAuth credentials exist, but the local shop record is missing. Rerun setup after confirming the Etsy account has exactly one shop.

### New shop returns zero listings or zero orders

That is valid. A newly opened Etsy shop may have no active listings and no orders. Read verification still succeeds if connection status and shop details are correct.

## Development

Automated tests use synthetic Etsy responses and an in-memory credential store.

```bash
npm run build
npm test
npm run check:safety
npm run verify
```

`npm run verify` runs the build, full Vitest suite, and the forbidden-tool safety allowlist.

See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), and [TERMS.md](TERMS.md).
