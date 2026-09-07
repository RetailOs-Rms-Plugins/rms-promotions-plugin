---
"@retailos-ai/rms-promotions-extension": patch
---

Recover a typed coupon code that Medusa refused to attach to the cart.

A coupon that computes to zero is dropped by `updateCartPromotionsStep`, so it appears in neither the cart's promotion links nor the `promotion_ext_config` table. Both lookups in `restoreEvictedStandardPromos` therefore missed it, and the coupon stayed at zero. This is the common shape: a cart with a single promoted product has no line with budget left over, so the code is evicted outright rather than merely starved.

`computeNonStandardAdjustments` now accepts `submittedCodes`, and the store route passes the codes the shopper actually entered. `restoreEvictedStandardPromos` resolves those by code, recomputes them against a clean budget, and links any that earn an adjustment.

Measured on a real Medusa backend with the published build for comparison. One line of 69 x 2 under a "2 for 129.90" bundle: the coupon went from 0.00 to 64.95. Two lines (99 x 1 under 79.90, plus the above): 38.27 to 99.45, which is 50% off the post-bundle total.
