---
"@retailos-ai/rms-promotions-extension": patch
---

Fix typed coupon codes discounting nothing on lines that already carry a bundle or buy-get promotion.

Medusa's `computeActions` shares one budget map and orders promotions by `application_method.value` descending, ignoring whether that value is a percentage or a price. A bundle promotion priced at 129.90 therefore computes before a "50% off" coupon (value 50) and drains the line's budget, leaving the coupon with a scrap of its worth or nothing at all. ADR-0009 already covered this for auto-apply promotions, but `restoreEvictedStandardPromos` only looked at `listPromotionExtConfigs({ auto_apply: true })` — and a typed coupon has no config row, so it was never rescued.

`restoreEvictedStandardPromos` now also picks up promotions linked to the cart that this plugin does not compute itself, and recomputes them against a clean budget. `computeNonStandardAdjustments` drops the starved amount for any promotion that was recomputed, so the clean value wins instead of losing the dedupe.

Measured against haturki cart `cart_01M05AGMYFNATQ1CEKA4MEEK9G`: a 50% coupon on a 69 x 2 line under a "2 for 129.90" bundle was writing 6.53 of discount and now writes 64.95.

Fixed-amount coupons whose value outranked the bundle price were already working and are unaffected.
