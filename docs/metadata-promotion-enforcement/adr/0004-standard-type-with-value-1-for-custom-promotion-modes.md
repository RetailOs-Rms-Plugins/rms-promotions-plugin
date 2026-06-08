# ADR-0004: Standard Type with Value 1 for Custom Promotion Modes (Bundle / Buy-Get Repeat)

**Status:** Accepted  
**Date:** 2026-05-21

---

## Context

The plugin introduces two new promotion modes — bundle pricing ("3 for 50€") and repeating buy-get deals ("buy 2 get 1 free" for every qualifying group). Medusa's native promotion system cannot express these:

- `type: "buyget"` only applies the deal **once** — 9 items with "buy 2 get 1 free" yields 1 free item, not 3.
- No native bundle pricing concept exists at all.

The plugin needs to compute its own adjustments for these modes. But the Medusa promotion record must still exist for lifecycle management (status, campaign, start/end dates, activation rules, admin UI listing).

The key constraint: **Medusa does not write a promotion to the cart if `application_method.value` is 0.** A promotion with `value: 0` is invisible — it doesn't appear in `cart.promotions`, making it impossible for the plugin's subscriber to detect and compute custom adjustments.

---

## Options

### Option A — `value: 0` on the Medusa promotion

Set the Medusa promotion's value to 0. The plugin computes all real adjustments.

**Rejected because:**
- Medusa does not write the promotion to the cart when `value: 0`. The promotion is absent from `cart.promotions`, so the plugin's Layer 2 subscriber cannot detect it, Layer 3 cannot validate it, and `getCart` doesn't show it to the storefront.

### Option B — `value: 1` with `type: "standard"`

Set the Medusa promotion to `type: "standard"` with `application_method.value: 1` and `target_type: "items"`. Medusa produces 1-cent `ADD_ITEM_ADJUSTMENT` actions for every eligible item. The plugin's subscriber overwrites these with the real computed amounts.

**Chosen because:**
- The promotion appears on the cart — Layer 2, Layer 3, and storefront can all see it.
- `type: "standard"` with `target_type: "items"` means Medusa marks every eligible item (useful for target rule evaluation, though the plugin evaluates target rules independently for bundle/buyget).
- The 1-cent adjustments exist only in the async window before the subscriber runs — same window already accepted for Layer 2 (see ADR-0001).

### Option C — Use Medusa's native `type: "buyget"`

Use Medusa's built-in buy-get type and extend it somehow.

**Rejected because:**
- Medusa's `buyget` has hardcoded once-only behavior that cannot be extended via documented hooks.
- No hook exists between `computeActions` and `setLineItemAdjustments` to intercept and modify the computation output.
- Would require proxy-wrapping the promotion module service, which ADR-0001 already rejected.

---

## Decision

Bundle and buy-get repeat promotions are created in Medusa as:

```ts
{
  type: "standard",
  application_method: {
    type: "fixed",
    target_type: "items",
    value: 1,
    allocation: "each",
    target_rules: [...] // scopes which items participate
  }
}
```

The real discount computation lives entirely in the plugin's `adjustment-calculator.ts`. The `promotion_mode` and `mode_config` fields on `PromotionExtConfig` control the calculation.

---

## Consequences

- **Merchants must set `value: 1` on bundle/buyget promotions.** The admin UI should hide the value field when `promotion_mode` is not `"standard"` and set `value: 1` programmatically. Until this UI is built, merchants must be instructed to set `value: 1` manually. This is a known UX gap.
- **Brief 1-cent adjustments in the async window.** Between cart mutation and subscriber execution, each eligible item shows a 1-cent discount. This is the same async window already accepted for Layer 2 — Layer 3 (checkout gate) ensures no order is placed with these placeholder amounts.
- **`type: "standard"` is used even for buy-get semantics.** Medusa's `type: "buyget"` is never used by this plugin. This may confuse developers who expect buy-get behavior to use Medusa's native type. Document clearly.
- **Target rules are evaluated by the plugin, not by Medusa's output.** Since `value: 1` produces trivial adjustments, the plugin cannot rely on Medusa's `computeActions` output to determine which items are eligible. The plugin maintains its own target rule evaluator that supports all 5 native Medusa attributes (`product`, `product_collection`, `product_category`, `product_type`, `product_tag`). When new target rule attributes are added (e.g., `brand_id`, `manufacturer_id` from ADR-0003), the target rule evaluator must be updated to support them.

---

## Limitations Discovered

### Budget contamination (see ADR-0009)

Medusa's `computeActions` uses a shared `appliedPromotionsMap` across all promotions in a single computation pass. Even with `value: 1`, each non-standard promotion consumes 1 unit of budget per eligible item. This can cause standard promotions computed later in the pass (sorted by `value` descending) to see a reduced or zero remaining budget, producing fewer adjustments than expected.

When a standard promotion produces zero adjustments, `computedPromotionCodes` excludes it, and `updateCartPromotionsStep(REPLACE)` removes it from the cart entirely. This is the root cause of the bug where auto-apply standard promotions (e.g., "10% off everything") are not applied when a non-standard promotion (e.g., a bundle) is also active.

The problem is worse when merchants set the native value to the actual bundle price (e.g., 25) instead of the prescribed `value: 1` — in that case, every item's entire budget is consumed and no standard promotion can produce adjustments.

ADR-0009 introduces a defense-in-depth fix: after non-standard adjustments are computed, the plugin detects evicted standard promotions and restores them with independently computed adjustments.

### Enforcement gap

The admin UI does not currently enforce `value: 1` programmatically — merchants must set it manually. Until the UI auto-sets the value when `promotion_mode` is not `"standard"`, merchants may inadvertently use the actual discount value, amplifying the budget contamination problem.
