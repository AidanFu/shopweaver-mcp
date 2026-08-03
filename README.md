# ShopWeaver MCP

ShopWeaver MCP is a personal, noncommercial Codex plugin for seller workflow automation. The implemented Etsy path manages one Etsy seller account through Etsy Open API v3: it reads shop, listing, and minimized order information and performs preview-first writes to draft listings only. The Amazon listing path still uses workbook-first planning from Google Drive product data, while Amazon Ads now supports read-only reporting plus preview/confirmation-gated campaign controls.

> The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.

## Current status

The local MCP server and Codex plugin are implemented. Automated verification covers OAuth, Keychain storage, Etsy response parsing, read tools, draft write confirmations, draft image uploads, draft inventory updates, Google Drive product/image import, Amazon workbook generation, order-summary minimization, and the safety allowlist.

Live Etsy verification has confirmed OAuth connection and read-only shop/listing/order-summary access against one shop. Draft creation remains intentionally manual: preview the exact payload first, then confirm only if the draft should be created in Etsy.

Amazon listing and A+ planning currently stop at `Product Information - Amazon Listing.xlsx`, a review workbook generated from the approved Google Drive folder workflow. Amazon Ads reporting and selected campaign controls are separate from that workbook path and remain preview/confirmation-gated. See [docs/amazon-listing-workflow/README.md](docs/amazon-listing-workflow/README.md).

TikTok integration is not included in the current scope.

## Safety boundary

ShopWeaver can create drafts, edit supported draft fields, upload draft images, and replace draft inventory. Every write defaults to preview mode, requires explicit confirmation with an unchanged payload, and rechecks remote draft state before updating.

ShopWeaver cannot publish, activate, or delete Etsy listings. It has no Etsy tools for ads, refunds, cancellations, shipments, Etsy Messages, or customer email. Order summaries exclude buyer email, shipping address, payment details, and messages.

The Amazon listing workflow cannot submit listings, upload images, or create A+ Content. Amazon Ads tools can read reporting data and preview selected campaign, bid, budget, keyword, negative-keyword, and campaign-creation changes. Any Amazon Ads write requires preview mode first, an unchanged payload, and an explicit confirmation token.

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
cd shopweaver-mcp
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

## Connect Google Drive

Create a Google OAuth client with this redirect URI:

```text
http://localhost:3004/google/redirect
```

Run:

```bash
npm run google:setup
```

Google tokens are stored in macOS Keychain. Allowed folder metadata is stored in ignored local config. Use `config.example.json` as the documented shape and keep real folder IDs out of Git.

Before Drive import work, run:

```bash
npm run google:status
```

This validates stored Google Drive authorization without printing tokens. If it reports `refreshStatus: "failed"` or `connected: false`, run `npm run google:setup` to reconnect Google Drive.

## Google Drive folder layout

```text
HandMade/
├── Product Information.xlsx
└── Images/
    └── Product Name/
        ├── 01-main.jpg
        ├── 02-detail.jpg
        └── ...
```

`Product Information.xlsx` uses column A for product names and column C for product description rows. A non-empty column A starts a new product block. The product name must exactly match its image folder name.

## Drive import workflow

1. Add an allowed folder by URL or ID with `google_drive_add_allowed_folder`.
2. Review configured folders with `google_drive_list_allowed_folders`.
3. Import folder records with `shopweaver_import_drive_folder`.
4. Review matched products, image counts, unmatched products, and unused image folders.
5. Use Codex to translate and enrich rows.
6. Confirm writing `Product Information - Etsy Draft.xlsx` with `shopweaver_write_enriched_workbook`.
7. Preview one Etsy draft with `shopweaver_preview_etsy_draft_from_enriched_row`.
8. Confirm Etsy draft creation and image uploads separately.

### Etsy variation drafts

Use this when several Drive products should become one Etsy draft listing with options such as Color.

1. Run `shopweaver_preview_etsy_variation_groups`.
2. Run `shopweaver_write_etsy_variation_workbook` in preview mode, then confirm mode.
3. Review `Product Information - Etsy Draft.xlsx` and correct `Listing Group`, `Variation 1 Name`, `Variation 1 Value`, SKU, price, quantity, and image folder columns.
4. Run `shopweaver_preview_etsy_variation_draft` for one listing group.
5. Preview and confirm `etsy_create_draft_listing`.
6. Preview and confirm `shopweaver_upload_drive_variation_images_to_etsy_draft`.
7. Preview and confirm `etsy_update_draft_inventory`.

The listing stays in draft. ShopWeaver does not publish, delete, update active listings, manage ads, process refunds, create shipments, send messages, or email buyers.

## Amazon workbook workflow

The Amazon workflow uses the same approved Google Drive folder import, but writes a separate planning workbook:

```text
Product Information - Amazon Listing.xlsx
```

Use `shopweaver_write_amazon_listing_workbook` in preview mode first, then confirm only after reviewing the row count and target folder. The generated workbook includes Amazon title, bullets, description, backend search terms, image notes, A+ Content planning copy, ad seed ideas, category suggestions, compliance notes, daily/weekly optimization input sheets, review-only recommendations, and review flags.

After Amazon metrics are pasted into the workbook, use `shopweaver_refresh_amazon_optimization_recommendations` in preview mode first, then confirm to refresh only the `Optimization Recommendations` sheet. This still does not call Amazon APIs or change listings, categories, bids, budgets, keywords, or ads.

This is not an Amazon listing submission path. Future listing API phases should be designed separately with Product Type Definitions validation, local preview, and explicit approval before every write.

## Amazon Ads workflow

Amazon Ads credentials are configured separately:

```bash
npm run amazon:ads:setup
```

Ads reporting starts read-only. Use Sponsored Products reports to analyze campaign performance, SKU spend, search-term waste, and efficient demand before changing anything.

Useful local commands:

```bash
npm run amazon:ads:sku -- --profile-id PROFILE --start-date YYYY-MM-DD --end-date YYYY-MM-DD --target-skus SKU1,SKU2 --report-id REPORT_ID --format summary
npm run amazon:ads:sku -- --profile-id PROFILE --start-date YYYY-MM-DD --end-date YYYY-MM-DD --target-skus SKU1,SKU2 --report-id REPORT_ID --format budget-preview
```

The `summary` format prints the balanced sales-growth and budget-efficiency plan. The `budget-preview` format prints the exact payload for the gated `amazon_ads_update_campaign_budgets` tool.

MCP Ads write tools are preview/confirmation-gated:

- `amazon_ads_update_campaign_budgets`
- `amazon_ads_update_campaign_bidding`
- `amazon_ads_update_campaign_states`
- `amazon_ads_update_keyword_bids`
- `amazon_ads_update_ad_group_bids`
- `amazon_ads_create_negative_keywords_from_review`
- `amazon_ads_create_campaigns`
- `amazon_ads_run_sku_budget_update_preview`

`amazon_ads_run_sku_budget_update_preview` runs the read-only SKU optimization cycle and returns a preview token for the exact budget updates it recommends. To apply a budget change, call `amazon_ads_update_campaign_budgets` in confirm mode with the unchanged campaigns payload and returned confirmation token.

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
- `google_drive_connection_status`
- `google_drive_add_allowed_folder`
- `google_drive_list_allowed_folders`
- `google_drive_remove_allowed_folder`
- `shopweaver_import_drive_folder`
- `shopweaver_write_enriched_workbook`
- `shopweaver_preview_etsy_draft_from_enriched_row`
- `shopweaver_upload_drive_images_to_etsy_draft`
- `shopweaver_preview_etsy_variation_groups`
- `shopweaver_write_etsy_variation_workbook`
- `shopweaver_preview_etsy_variation_draft`
- `shopweaver_upload_drive_variation_images_to_etsy_draft`
- `shopweaver_write_amazon_listing_workbook`
- `shopweaver_refresh_amazon_optimization_recommendations`
- `amazon_ads_run_sku_budget_update_preview`
- `amazon_ads_update_campaign_budgets`
- `amazon_ads_update_campaign_bidding`
- `amazon_ads_update_campaign_states`
- `amazon_ads_update_keyword_bids`
- `amazon_ads_update_ad_group_bids`
- `amazon_ads_create_negative_keywords_from_review`
- `amazon_ads_create_campaigns`

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
cd path/to/shopweaver-mcp
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
