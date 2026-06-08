---
"@retailos-ai/rms-promotions-extension": patch
---

fix: restore standard promotions evicted by non-standard budget contamination

Medusa's `computeActions` uses a shared budget map across all promotions. Non-standard promotions (bundle, buy-get repeat) consumed item budgets with their native `application_method.value`, leaving zero remaining budget for standard promotions computed later. This caused standard auto-apply promotions (e.g., "10% off") to produce zero adjustments and be removed from the cart entirely when a non-standard promotion (e.g., a bundle) was also active.

Added `restoreEvictedStandardPromos` — after non-standard adjustments are computed, detects standard auto-apply promotions that were wrongly evicted, re-links them to the cart, and computes their adjustments independently with a clean budget context.

See ADR-0009 for full analysis.
