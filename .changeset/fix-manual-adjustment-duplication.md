---
"@retailos-ai/rms-promotions-extension": patch
---

Fix manual/ext adjustment duplication on cart mutations (BF-015)

Manual and cart_ext_adjustment-tracked adjustments (e.g., Simply club discounts) were duplicated on every
cart mutation (add item, update quantity, change address). Each mutation added one more copy per line item,
inflating discount_total by 1× per mutation.

Root cause: `applyExtAdjustmentsToCart` read the same adjustment from two sources — cart item adjustments
(`preservedAdjustments`) and the `cart_ext_adjustment` table (`customAdjustments`) — and merged them without
cross-source deduplication.

Fix: Skip adjustments in `preservedAdjustments` whose code matches a `cart_ext_adjustment` record. Those
adjustments are always re-created fresh from the table, so preserving them from cart items double-counts them.
