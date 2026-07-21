---
"@retailos-ai/rms-promotions-extension": patch
---

Add recalcStandardAdjustments to correct native Medusa promotion adjustments after tier repricing. Percentage promos are recalculated using the repriced unit_price; fixed-amount promos are capped at the item subtotal when the discount exceeds the repriced price.
