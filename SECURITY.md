# Security

## Credential handling

ShopWeaver version one runs locally on macOS. The setup command accepts Etsy credentials through masked terminal input and stores app credentials and OAuth tokens in macOS Keychain. Google Drive OAuth tokens are also stored in macOS Keychain. Secrets must never be entered in chat, command-line arguments, committed environment files, logs, fixtures, screenshots, or MCP tool parameters.

Real Google Drive folder config must not be committed. Use `config.example.json` for documentation and keep local folder IDs in ignored config. Drive imports are limited to explicitly allowed folders and must not scan all Drive files.

Errors redact tokens, credentials, authorization codes, request headers, and customer fields. Read requests use bounded retries for known transient failures. Write requests are never retried automatically.

## Write protection

Every write requires a short-lived, single-use preview token bound to the exact normalized payload, connected shop, action, and listing. Confirmed listing changes re-fetch Etsy state and reject non-draft listings.

## Reporting vulnerabilities

Report vulnerabilities privately to the repository owner through GitHub's private vulnerability reporting feature. Do not include real Etsy credentials, tokens, shop records, orders, or customer data in a report.
