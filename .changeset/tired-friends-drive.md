---
"@retailos-ai/rms-promotions-extension": minor
---

Reuse Medusa's native application_method fields for bundle and buy-get repeat promotions.

Bundle and buy-get modes no longer store discount parameters (bundle_price, discount_type, discount_value) in mode_config. Instead, they read value, type, and max_quantity directly  
 from the promotion's application_method. This eliminates duplicate fields, removes the need for dummy values, and gives max_quantity a real purpose as a repeat cap (max bundles or max
buy-get cycles).

Promotion type compatibility is now validated on both frontend and backend — bundle requires "Amount off products" (fixed), buy-get requires any product-level type. The admin UI shows
these Medusa fields as read-only with info tooltips in the promotion mode container, and the edit drawer only exposes mode-specific structural fields (bundle_size, buy/get
quantities). The mode container now always shows the dropdown menu and auto-creates the promotion_ext_config on first edit, removing the dependency on the rules drawer.

Domain context (CONTEXT.md) and project documentation (README.md, llms.txt) updated to reflect all changes.
