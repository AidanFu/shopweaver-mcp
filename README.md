# ShopWeaver MCP

ShopWeaver MCP is a personal, noncommercial Codex plugin for managing one Etsy seller account through Etsy Open API v3. It reads shop, listing, and minimized order information and performs preview-first writes to draft listings only.

> The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.

## Safety boundary

ShopWeaver can create drafts, edit supported draft fields, upload draft images, and replace draft inventory. Every write defaults to preview mode, requires explicit confirmation with an unchanged payload, and rechecks remote draft state before updating.

ShopWeaver cannot publish, activate, or delete listings. It has no tools for ads, refunds, cancellations, shipments, Etsy Messages, or customer email. Order summaries exclude buyer email, shipping address, payment details, and messages.

## Requirements

- macOS
- Node.js 22 or newer
- One Etsy shop
- An Etsy developer application with the callback URI registered exactly
- Etsy application approval before live verification

## Build

```bash
git clone https://github.com/AidanFu/shopweaver-mcp.git
cd shopweaver-mcp
npm ci
npm run build
npm run verify
```

The repository root is the Codex plugin root. `.codex-plugin/plugin.json` registers the skill and `.mcp.json` runs `node dist/index.js`. Install the released plugin from its configured Codex marketplace after publication. For source development, configure a local marketplace entry pointing to this repository, then run `codex plugin add shopweaver-mcp@<marketplace-name>`.

## Connect Etsy

Register the redirect URI from `.env.example` in the Etsy developer application, or choose another URI and enter the exact same value during setup.

```bash
npm run setup
```

Enter the Etsy keystring and shared secret only in the masked terminal prompts. Do not paste them into Codex chat, command-line arguments, environment files, logs, or MCP tool arguments. Credentials and OAuth tokens are stored in macOS Keychain under `com.aidanfu.shopweaver-mcp`.

The requested scopes are `shops_r listings_r listings_w transactions_r`.

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

## Development status

Automated tests use synthetic Etsy responses and an in-memory credential store. Live Etsy verification remains blocked until the developer application is approved. The first live session will perform read checks and create exactly one user-confirmed draft, then stop.

See [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), and [TERMS.md](TERMS.md).
