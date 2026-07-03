# ShopWeaver MCP Design

## Purpose

ShopWeaver MCP is a personal, noncommercial Codex plugin for managing one Etsy seller account through Etsy Open API v3. Version one connects the shop, reads shop and listing information, creates and edits draft listings, uploads listing images, updates draft prices and inventory, and reads sanitized order summaries.

The project will be published as reusable source code. Each user must register their own Etsy developer application and provide their own credentials locally.

Version one supports macOS because production credential storage uses macOS Keychain. Other operating systems are outside the initial scope.

## Scope

Version one includes:

- OAuth authorization for one Etsy shop.
- Read-only shop and listing access.
- Draft listing creation and editing.
- Draft image uploads.
- Draft price and inventory updates.
- Read-only order summaries with minimized customer data.
- A personal Codex plugin, local TypeScript MCP server, documentation, and automated tests.

Version one excludes:

- Publishing or deleting listings.
- Updating active listings.
- Advertising management.
- Refunds and cancellations.
- Shipment creation or modification.
- Etsy Messages or direct customer email.
- A hosted multi-user service.

## Architecture

The personal Codex plugin contains:

1. A plugin manifest that registers the ShopWeaver MCP server and skill.
2. A TypeScript MCP server that exposes narrowly scoped Etsy tools.
3. An Etsy Open API client responsible for authentication, requests, response parsing, and rate-limit handling.
4. A temporary localhost OAuth callback used only while connecting an account.
5. A credential-store adapter backed by macOS Keychain in production and an in-memory implementation in tests.
6. A Codex skill describing setup, supported tools, and mandatory safety rules.

The server runs locally. No hosted application, database, or remote credential store is required.

## Authentication and credential storage

The setup command prompts for the Etsy API keystring and shared secret in the terminal. Secrets must not be entered into Codex chat, command-line arguments, logs, environment files committed to Git, or MCP tool parameters.

The setup flow:

1. Collects credentials through masked terminal input.
2. Stores credentials in macOS Keychain.
3. Starts a temporary localhost OAuth callback.
4. Opens an Etsy OAuth authorization URL with only the required scopes.
5. Receives the authorization response and exchanges it for access and refresh tokens.
6. Stores tokens in Keychain and shuts down the callback.

Tokens are refreshed when necessary. Logs and error messages must redact credentials, tokens, authorization codes, customer information, and request headers.

## MCP tools

Read-only tools:

- `etsy_connection_status`: Reports whether credentials and an authorized shop connection are available without returning secret values.
- `etsy_get_shop`: Returns basic information for the connected shop.
- `etsy_list_listings`: Lists the connected shop's listings with state and basic inventory information.
- `etsy_get_listing`: Returns operational listing details for one listing.
- `etsy_list_order_summaries`: Returns minimized order summaries containing order ID, status, date, item titles, quantities, and totals.

Draft-management tools:

- `etsy_create_draft_listing`: Validates and previews a draft listing, then creates it only after explicit confirmation.
- `etsy_upload_draft_image`: Uploads a specified local product image only to a confirmed draft listing.
- `etsy_update_draft_listing`: Previews and updates supported fields only when the current Etsy state is `draft`.
- `etsy_update_draft_inventory`: Previews and updates draft quantities, SKUs, variations, and prices only when the current Etsy state is `draft`.

Every write tool defaults to preview mode. The confirmed request must exactly match the previewed payload. The server checks the remote listing state immediately before an update and rejects writes to non-draft listings.

There is no publish, activate, delete, refund, cancellation, advertisement, shipment, message, or email tool in version one.

## Data minimization

The plugin requests the minimum Etsy OAuth scopes and response fields needed for version-one behavior. Order tools do not retrieve or return customer email, shipping address, payment details, or message content. Etsy data is not persisted beyond the credential material required for authorization.

Product images are transmitted to Etsy only when the user explicitly requests an upload to a draft listing. Image files remain at their original local paths and are not copied into the plugin repository.

## Error handling

Errors are returned as concise, actionable messages with sensitive fields removed.

- Authentication errors direct the user to reconnect.
- Validation errors identify the invalid listing field before any request is sent.
- Rate-limit responses include the safe retry time when Etsy provides it.
- Read requests may retry with bounded backoff when the failure is known to be transient.
- Write requests never retry automatically.
- An uncertain draft-creation result stops and instructs the user to inspect existing drafts before trying again, preventing duplicate listings.

## Testing strategy

Automated tests use mocked Etsy responses and an in-memory credential store. They cover:

- MCP tool schemas and input validation.
- OAuth callback, authorization exchange, and token refresh.
- Credential-store boundaries and secret redaction.
- Etsy response parsing.
- Draft preview and confirmed creation.
- Payload equality between preview and confirmation.
- Rejection of active-listing updates.
- Order-summary data minimization.
- Rate-limit and expired-token behavior.
- Duplicate-draft prevention after uncertain failures.

Live verification occurs only after Etsy approves the developer application:

1. Connect the Etsy account.
2. Run connection, shop, and listing read checks.
3. Preview one draft listing.
4. Create that draft after explicit user confirmation.
5. Verify the draft manually in Etsy Shop Manager.
6. Perform no further live writes until the user accepts the result.

## Delivery milestones

1. Plugin skeleton, MCP server health check, automated test harness, and documentation.
2. Keychain-backed credentials, OAuth connection, and read-only shop/listing tools.
3. Draft listing preview, creation, image upload, and draft update tools.
4. Sanitized order-summary tool.
5. Supervised live verification after Etsy approval.
6. Public GitHub documentation and release preparation.

Each milestone must pass its automated tests before the next begins.

## Repository and compliance

The public repository is `AidanFu/shopweaver-mcp` and uses the MIT license. It includes the plugin manifest, MCP server, skill, source code, tests, mock fixtures, setup documentation, `.gitignore`, `.env.example`, `SECURITY.md`, `PRIVACY.md`, and `TERMS.md`.

GitHub Actions will run automated tests and secret scanning. The repository must never contain Etsy credentials, OAuth tokens, authorization codes, shop data, order data, customer data, or local Keychain exports.

The following statement must appear prominently in the README and application documentation:

> The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.

The project will not use Etsy logos, trade dress, or language that implies endorsement. Etsy API access remains subject to Etsy approval and current API terms.
