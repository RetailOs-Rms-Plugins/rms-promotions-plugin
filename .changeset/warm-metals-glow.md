---
"@retailos-ai/rms-promotions-extension": patch
---

Bug Fixes

- Filter zero-amount adjustments and unlink budget-exhausted promos: Engine no longer produces $0 line-item
  adjustments. Promotions whose budget is fully consumed are automatically unlinked from the cart.
- Unit tests for BF-010, BF-012, BF-013 bug fixes.
- Mode config vs max_quantity validation: Backend now validates mode_config changes (not just promotion_mode
  changes) against the promotion's max_quantity. Frontend shows a descriptive toast instead of "Internal Server
  Error" when bundle_size or buy_quantity exceeds max_quantity.
- Number input clearing in promotion mode form: Clearing bundle_size, buy_quantity, or get_quantity fields no
  longer snaps back to the original value.

Features

- Metadata field added to all four plugin models (PromotionExtConfig, PromotionExtRuleGroup, PromotionExtRule,
  CartExtAdjustment): model definition, types using MetadataType, Zod validators, workflow steps, query configs,
  and API route handlers updated end-to-end. Migration adds jsonb nullable columns to the three models that
  didn't have it.
