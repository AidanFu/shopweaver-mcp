---
name: shopweaver
description: Use when reading one connected Etsy shop, reviewing listings, creating or editing Etsy drafts, uploading draft images, changing draft price or inventory, or summarizing Etsy orders.
---

# ShopWeaver

Use the ShopWeaver MCP tools for one Etsy seller account. Keep all writes draft-only, preview-first, and confirmation-bound.

## Workflow

1. Call `etsy_connection_status` before any Etsy operation. If disconnected, direct the user to run `npm run setup` in a terminal.
2. Never ask the user to paste credentials, tokens, authorization codes, customer data, or request headers into chat.
3. For reads, use the smallest relevant tool and return only the requested operational fields.
4. Preview every write: omit `mode` or set it to `preview`. Show the complete normalized changes, warning, and expiry.
5. Ask for explicit confirmation only after the preview is visible.
6. Confirm using the unchanged payload and returned `confirmationToken`.
7. Stop if the listing is not a draft, the token expired, the payload changed, or Etsy reports an uncertain creation result.

## Tools

| Need | Tool |
|---|---|
| Connection state | `etsy_connection_status` |
| Shop details | `etsy_get_shop` |
| Listing summaries | `etsy_list_listings` |
| Listing and inventory details | `etsy_get_listing` |
| Minimized order summaries | `etsy_list_order_summaries` |
| New draft | `etsy_create_draft_listing` |
| Draft fields | `etsy_update_draft_listing` |
| Draft image | `etsy_upload_draft_image` |
| Draft quantity, SKU, variations, or price | `etsy_update_draft_inventory` |

## Safety boundary

- Operate only on the connected shop.
- Treat every write preview as single-use and short-lived.
- Never retry a failed write automatically.
- After an uncertain draft creation, tell the user to inspect Etsy drafts before trying again.
- Never claim this plugin can publish, delete, advertise, refund, cancel, ship, message, or email.
- Do not request or expose buyer email, address, payment details, or message content.

## Example

User: "Change draft 123 to $29.00."

Call `etsy_get_listing` to confirm draft state, then preview `etsy_update_draft_inventory`. Present the exact price change and warning. After explicit confirmation, call the same tool with the unchanged inventory and confirmation token.
