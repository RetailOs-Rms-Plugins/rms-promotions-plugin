---
"@retailos-ai/rms-promotions-extension": patch
---

**Sync cart responses:** Store route overrides for add/update/delete line-items and promo code entry now run auto-apply evaluation and non-standard adjustment computation after the workflow
completes, ensuring the API response includes correct promotions and adjustments immediately — no stale data.

**Workflow hook:** `refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection` computes non-standard adjustments (bundle, buy-get-repeat) for already-applied promotions inside the
workflow lifecycle.

**Bug fixes:**

- `appliedPromotionCodes` now excludes removed promos, preventing orphaned ext adjustments
- Code-applied promotions with ext-rules are re-evaluated on cart changes (not just auto-apply ones)
- Per-cart in-memory lock and ext row dedup prevent duplicate adjustments from concurrent `setLineItemAdjustments` calls

**Shared functions extracted:**

- `evaluateAutoApplyPromotions` — shared by route overrides and async subscriber
- `computeNonStandardAdjustments` — shared by hook, route overrides, and subscriber

**Docs:** ADR-0007 (route override architecture), ADR-0006 (in-memory lock), updated CONTEXT.md, README, and llms.txt with enforcement architecture and extended promotion compatibility matrix.
