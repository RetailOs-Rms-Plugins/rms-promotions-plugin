# ADR-0010: Recalculate Standard Promo Adjustments After Tier Repricing

**Status:** Accepted  
**Date:** 2026-07-21

---

## Context

Medusa's `refreshCartItemsWorkflow` calculates native promotion adjustments (percentage discounts) using the **original variant price**, before any extension hooks fire. Our tier-repricing logic (`repriceCartByQuantityTiers` from `rms-price-lists-extension`) runs in the `beforeRefreshingPaymentCollection` hook — the only hook Medusa exposes — which fires *after* adjustments are already calculated.

This means a 10% promo on a €15 item tier-repriced to €8 produces a €1.50 adjustment instead of the correct €0.80. The customer sees `unit_price: 8` but the discount is based on a price that never appears in the cart.

There is no Medusa hook between "resolve prices" and "compute promotion adjustments" that would let us reprice first.

---

## Decision

Add `recalcStandardAdjustments` — a function that runs in the cart-orchestrator hook **after** `repriceCartByQuantityTiers` and **before** `computeNonStandardAdjustments`. It:

1. Reads existing line item adjustments left by Medusa's native calculation
2. Queries linked promotions to identify which use `application_method.type: "percentage"`
3. Recalculates `amount = (percentage / 100) × current unit_price × quantity` using the post-repricing price
4. For fixed-amount promos: caps the adjustment at `unit_price × quantity` when the repriced price is smaller than the discount
5. Updates only adjustments whose amounts actually changed (avoids unnecessary writes)

This approach trusts Medusa's item targeting (which items qualify) and only corrects the dollar amounts.

### Why only native Medusa adjustments

The function only touches adjustments placed by Medusa's native promotion calculation — it filters for `promotion_id` present and `provider_id` absent.

Our custom promotion modes (bundle, buy-get-repeat) are calculated by `computeNonStandardAdjustments`, which runs **after** this function in the orchestrator hook. At the point `recalcStandardAdjustments` executes, those custom adjustments don't exist on the cart items yet — they haven't been written. So there's no risk of accidentally recalculating adjustments that are already correct.

### Execution order in rms-cart-orchestrator

**sync-cart-plugins.ts (hook):**

```
1. evaluateAutoApplyPromotions   — links promos to cart
2. repriceCartByQuantityTiers    — updates unit_price to tier price
3. recalcStandardAdjustments     — ← THIS FUNCTION (fixes native adjustments)
4. computeNonStandardAdjustments — calculates bundle/buy-get (already uses repriced prices)
```

**cart-updated.ts (fallback subscriber):** same order, repricing before promotion logic.

---

## Consequences

- Percentage-based standard promotions now discount off the tier-repriced price, matching what the customer sees in the cart.
- Fixed-amount promos are capped so the discount never exceeds the repriced item subtotal.
- The function must be called from both `sync-cart-plugins.ts` (the hook) and `cart-updated.ts` (the fallback subscriber) in `rms-cart-orchestrator`.
- If Medusa adds a pre-adjustment hook in the future, this recalculation becomes unnecessary and should be removed.
