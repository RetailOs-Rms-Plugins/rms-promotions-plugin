---
"@retailos-ai/rms-promotions-extension": patch
---

Fix target rule attribute normalization, add promotion mode validation, and improve documentation.

The target-rule-evaluator crashed on Medusa's full-path target rule attributes (e.g. "items.product.id") because it only recognized short names like  
 "product". This caused the cart-updated subscriber to fail before computing bundle/buy-get adjustments, leaving Medusa's native (incorrect) discount in  
 place. Added a normalization map that translates all five Medusa attribute formats to the plugin's short keys.

Added cross-validation in mode-validation.ts: max_quantity must be >= bundle_size for bundle mode and >= buy_quantity for buy-get repeat mode, and bundle  
 value must be > 0. Without this, promotions silently produce zero adjustments at runtime. Validation errors from the backend are now surfaced as toast
messages in the admin UI instead of being silently swallowed.

Fixed hardcoded EUR currency in the promotion mode display widget — now reads currency_code from the promotion's application_method and formats with  
 Intl.NumberFormat.

Added red warning text in the promotion mode display widget when max_quantity is incompatible with bundle_size or buy_quantity.

Updated README.md with end-to-end examples for creating bundle and buy-get promotions via both API and admin UI, including max_quantity constraints. Updated
llms.txt to version 1.1.0 with matching examples, UI guides, and expanded troubleshooting.
