# Privacy

ShopWeaver runs locally and connects directly to Etsy Open API v3. It does not operate a hosted service or remote database.

macOS Keychain stores only the Etsy app credentials, OAuth tokens, token expiry, granted scopes, and connected user/shop identifiers required for authorization. Shop, listing, inventory, and order responses are processed in memory and are not persisted by ShopWeaver.

Order tools return only order ID, status, timestamps, item titles, quantities, and totals. They do not return buyer email, shipping address, payment details, or messages. Product images are transmitted only after explicit confirmation of an upload to a draft and remain at their original local paths.
