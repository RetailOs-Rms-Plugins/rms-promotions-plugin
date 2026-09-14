---
"@retailos-ai/rms-promotions-extension": patch
---

Stop bundle and buy-get discounts from driving a cart line below zero.

`capAdjustmentsToSubtotal` subtracted the priority adjustments (the bundle and buy-get rows) from each line's budget but never bounded them by it, then returned them verbatim. Only the standard adjustments were clamped. A single bundle discount larger than its line's subtotal, or two priority rows on one line, therefore wrote more discount than the line was worth. `Math.max(0, ...)` on the standard branch hid the overspend from the other adjustments but left the priority rows themselves unbounded, so the line total still came out negative.

Priority adjustments now run through the same per-item budget as the standard ones: each is clamped to whatever is left of its line's subtotal, and a row with nothing left to claim is dropped. The cap stays per line item, which is the boundary that makes a line invalid.

Clamping is what a shopper expects. The alternative, refusing the promotion and charging full price for the line, was considered and rejected: it is safer for the merchant's books but charges someone who was shown a bundle price more than they expected.

One deliberate exception, on the priority rows only. When `itemSubtotals` is empty, every priority row passes through uncapped, because an empty map means the caller could not read the cart's items at all. An unreadable cart is not a zero budget, and reading it as one would delete every bundle discount on that cart. There is no line to go negative in that case either. A single item missing from an otherwise populated map is a stale row, and still caps to zero.

A starved priority row is dropped rather than kept at zero, matching the standard branch. `computeNonStandardAdjustments` filters on `amount > 0` when deciding which promotions stay linked, so a zeroed row and a dropped row behave the same there: a freshly linked promotion that ends up fully starved is unlinked from the cart.

`docs/metadata-promotion-enforcement/CONTEXT.md` recorded this under "Adjustment Conflict Resolution" as a known gap that could take a line below its price "in theory". No customer order has been traced to it.
