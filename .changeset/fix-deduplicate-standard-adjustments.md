---
"@retailos-ai/rms-promotions-extension": patch
---

Fix duplicate standard promotion adjustments caused by race between workflow hook and cart.updated subscriber. Deduplicates preserved+restored adjustments by promotion_id+item_id before scaling and capping.
