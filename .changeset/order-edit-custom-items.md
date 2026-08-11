---
"@retailos-ai/rms-promotions-extension": minor
---

Add custom line items to orders via order-edit workflow

New admin API route `POST /admin/order-edits/:id/custom-items` allows adding line items without a product variant (title + unit_price + quantity) to an active order-edit session. Includes an admin widget on the order detail page with a form matching the Medusa draft-order pattern. Guards against paid/fulfilled orders. Existing promotion adjustments are preserved — no recalculation occurs.

This is a temporary workaround for the order-edit promotion gap: custom promotions only recalculate on carts, not order edits. Store managers can manually apply missed discounts as negative-price custom items.
