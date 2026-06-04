---
"@retailos-ai/rms-promotions-extension": patch
---

fix: forward is_tax_inclusive and metadata to Medusa LineItemAdjustment

- Fixed incorrect cart totals in tax-inclusive regions (e.g., Israel 18% VAT) where bundle/buyget discounts were double-taxed
- Forward `is_tax_inclusive` from the promotion to CartExtAdjustment and through to Medusa's LineItemAdjustment in all three transfer paths (preserved, item-specific, cart-wide)
- Forward `metadata` through the same paths to maintain full field parity with Medusa's native adjustments
- Removed `BUNDLE_`/`BUYGET_REPEAT_` prefix from adjustment `code` field — now uses the raw promotion code to align with Medusa's convention (`adjustment.code === promotion.code`). Manual adjustments keep `MANUAL_<id>`.
