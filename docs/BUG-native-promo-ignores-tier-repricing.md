# Bug: Native Medusa Promotions Ignore Tier-Repriced Prices

**Date:** 2026-07-21
**Severity:** Medium — incorrect discount amounts on carts with quantity tier pricing + standard promotions
**Affected plugins:** `rms-cart-orchestrator@1.0.1`, `rms-promotions-extension@1.3.1`, `rms-price-lists-extension@1.2.1`

---

## Summary

When a cart has both quantity-tier pricing (from `rms-price-lists-extension`) and a standard percentage promotion (Medusa native calculation), the promotion discount is calculated on the **original variant price**, not the tier-repriced price. The customer sees the repriced `unit_price` but the discount is based on a price that never appears in the cart.

## Example (from live testing)

- **Jacket** — original price: €15, tier price at qty 3+: €8
- **Promotion `off10`** — 10% off, Standard mode, Medusa native calculation
- **Expected adjustment:** 10% of €8 x 3 = €2.40
- **Actual adjustment:** 10% of €15 x 3 = **€4.50**

The cart shows `unit_price: 8` but `adjustment.amount: 4.5`.

## Root Cause

Medusa's `refreshCartItemsWorkflow` execution order:

```
refreshCartItemsWorkflow (Medusa core):
  step 1: resolve prices (original variant price)
  step 2: calculate native promo adjustments  ← uses original price
  step 3: ...
  step N: beforeRefreshingPaymentCollection hook fires  ← OUR code runs here
           → evaluateAutoApplyPromotions (links/unlinks promos)
           → repriceCartByQuantityTiers (updates unit_price to tier price)  ← too late
           → computeNonStandardAdjustments (bundle/buy-get-repeat only)
```

The only hook Medusa exposes (`beforeRefreshingPaymentCollection`) fires **after** native promotion adjustments are already calculated. There is no hook between "resolve prices" and "compute promotion adjustments."

### Why our auto-apply doesn't help

The promotion's "Auto Apply: ON" flag is handled by our plugin (`evaluateAutoApplyPromotions`), which only **links** the promotion to the cart via `remoteLink.create`. It does NOT calculate the adjustment amount. The actual discount calculation for "Standard / Medusa native" promotions is done entirely by Medusa core — before our hook runs.

### Why `computeNonStandardAdjustments` doesn't help

This function only processes promotions with `promotion_mode !== "standard"` (bundle, buy-get-repeat). For standard promos it returns early:

```ts
// In computeNonStandardAdjustments:
const nonStandardConfigs = allConfigs.filter(
  (c) => c.promotion_mode && c.promotion_mode !== "standard"
)
if (!nonStandardConfigs.length && !options?.freshlyLinkedCodes?.length) return
```

The `applyExtAdjustmentsToCart` inner function does call `setLineItemAdjustments` which overwrites all adjustments — but it **preserves** native promo adjustments with their original (wrong) amounts. It doesn't recalculate them.

## What Does NOT Have This Problem

- **Bundle pricing** promotions — calculated by `computeNonStandardAdjustments` after repricing
- **Buy-get-repeat** promotions — same, runs after repricing
- **Fixed amount** promotions — amount is absolute, not price-dependent (though the discount might still be conceptually "wrong" if it was intended relative to tier price)
- **Products without quantity tier pricing** — no repricing happens, so native calculation is correct

## Proposed Fix

Add a new function (e.g. `recalcStandardAdjustmentsAfterReprice`) that runs in the cart-orchestrator hook **after** `repriceCartByQuantityTiers` and **before** `computeNonStandardAdjustments`:

```
Hook execution order (after fix):
  → evaluateAutoApplyPromotions
  → repriceCartByQuantityTiers
  → recalcStandardAdjustmentsAfterReprice   ← NEW
  → computeNonStandardAdjustments
```

This function should:

1. Read the cart's current line item adjustments (written by Medusa with wrong amounts)
2. Read linked promotions and identify which are `application_method.type: "percentage"`
3. For each percentage promo adjustment: recalculate `amount = (percentage / 100) x repriced_unit_price x quantity`
4. For fixed-amount promos: leave as-is (or reconsider if they should also be recalculated)
5. Write corrected adjustments via `cartModule.setLineItemAdjustments` or `cartModule.updateLineItemAdjustments`

### Where this code should live

- **New function** in `rms-promotions-plugin` (e.g. `src/lib/recalc-standard-adjustments.ts`), exported via `./cart-logic`
- **Called from** `rms-cart-orchestrator` `src/subscribers/sync-cart-plugins.ts`
- Also needs to be called in `src/subscribers/cart-updated.ts` (the fallback subscriber)

### Key considerations

- Only recalculate when repricing actually changed a price (avoid unnecessary overwrites)
- Handle `allocation: "each"` vs `allocation: "across"` correctly
- Respect `max_quantity` on the application method
- Respect `target_rules` — only items matching the promo's target rules should have adjustments
- The `cart.updated` fallback subscriber also needs this fix
- Test with: percentage promos, fixed promos, mixed tier + non-tier items, multiple promos on same cart

## Relevant Source Files

| File | Repo | Purpose |
|---|---|---|
| `src/subscribers/sync-cart-plugins.ts` | `rms-cart-orchestrator` | Hook where fix is called |
| `src/subscribers/cart-updated.ts` | `rms-cart-orchestrator` | Fallback subscriber, also needs fix |
| `src/lib/reprice-cart.ts` | `rms-price-lists-extension` | Tier repricing logic |
| `src/lib/compute-non-standard-adjustments.ts` | `rms-promotions-plugin` | Non-standard adjustment logic (reference for patterns) |
| `src/lib/evaluate-auto-apply-promotions.ts` | `rms-promotions-plugin` | Auto-apply linking logic |
| `docs/known-limitations.md` | `rms-cart-orchestrator` | Documents this as a known limitation (update after fix) |

## Suggested Skills

- `/youleap-brain` — fetch latest plugin source code and cross-repo context
- `/building-with-medusa` — Medusa v2 patterns for modules, workflows, hooks
- `/youleap-medusa-patterns` — Youleap-specific Medusa backend conventions
- `/youleap-issue-to-pr` — once the fix is implemented, create the PR

## Branch Context

The plugins were installed on branch `feat/install-cart-orchestrator-price-lists-v2` in `medusa-backend` with these commits:
1. `cf94366` — bump rms-medusa-ui to ^1.3.2
2. `17d0fe5` — bump rms-promotions-extension to ^1.3.1
3. `0c9d6fc` — install rms-price-lists-extension ^1.2.0
4. `2df43bf` — install rms-cart-orchestrator ^1.0.1
