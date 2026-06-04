# ADR-0008: Line Item Adjustment Field Parity with Medusa

**Status:** Accepted (partial — `is_tax_inclusive`/`metadata` fix applied, `code` prefix removal deferred)  
**Date:** 2026-06-03  
**Relates to:** ADR-0005 (re-apply after wipe for custom adjustments)

---

## Context

The `CartExtAdjustment` model was designed to mirror Medusa's `LineItemAdjustment` model field-for-field, so that custom adjustments (bundle, buy-get repeat, manual) could be faithfully transferred to Medusa's native adjustment table via `setLineItemAdjustments`. Two field-level divergences were discovered during production testing with tax-inclusive pricing (Israel, 18% VAT):

1. **`is_tax_inclusive` and `metadata` were silently dropped** during the transfer from `CartExtAdjustment` to Medusa's `LineItemAdjustment`.
2. **The `code` field uses a prefixed format** (`BUNDLE_WC_BUNDLE_5`) instead of Medusa's convention of using the raw promotion code (`WC_BUNDLE_5`).

Both issues were discovered while testing a bundle promotion (`WC_BUNDLE_5`, bundle size 2, bundle price 120 ILS) against tax-inclusive item prices (65 ILS each, 18% VAT included).

---

## Problem 1: `is_tax_inclusive` and `metadata` Not Forwarded

### Symptom

A bundle promotion with two items at 65 ILS each (tax-inclusive) and a bundle price of 120 ILS produced a cart total of **118.2 ILS** instead of the expected **120 ILS**.

### Root Cause

The transfer function `applyExtAdjustmentsToCart` in `compute-non-standard-adjustments.ts` builds adjustment objects for `setLineItemAdjustments` but omitted `is_tax_inclusive` and `metadata` from **all three code paths**:

| Path | Purpose | Fields missing |
|---|---|---|
| `preservedAdjustments` (line 189-205) | Re-emit native Medusa adjustments not belonging to custom-mode promotions | `is_tax_inclusive`, `metadata` |
| `customAdjustments` — item-specific (line 207-226) | Apply item-level ext adjustments | `is_tax_inclusive`, `metadata` |
| `customAdjustments` — cart-wide spread (line 228-252) | Spread cart-wide ext adjustments across items | `is_tax_inclusive`, `metadata` |

Additionally, the `createCartExtAdjustments` call (line 137-149) that stores the ext adjustment record never read `is_tax_inclusive` from the promotion, so the ext adjustment row was always stored with the model default (`false`), regardless of the promotion's setting.

### Why This Caused Incorrect Totals

The bundle calculator (`adjustment-calculator.ts`) computes savings from `unit_price` values:

```
originalTotal = 65 + 65 = 130  (tax-inclusive)
bundleTotal   = 1 × 120 = 120
totalSavings  = 130 - 120 = 10
```

The 10 ILS adjustment was derived from tax-inclusive prices — it already accounts for tax. But when written to Medusa's `LineItemAdjustment` without `is_tax_inclusive: true`, Medusa treated it as a pre-tax discount and added 18% VAT on top:

- `discount_subtotal`: 10
- `discount_tax_total`: 10 × 0.18 = 1.8
- `discount_total`: 11.8
- `total`: 130 - 11.8 = **118.2** (wrong, should be 120)

The `preservedAdjustments` path had an additional impact: even standard Medusa promotions with `is_tax_inclusive: true` would lose that flag after our plugin ran `setLineItemAdjustments`, because we re-emitted them without the field.

### Medusa's Native Behavior (Reference)

In `@medusajs/core-flows/dist/cart/steps/prepare-adjustments-from-promotion-actions.js`, Medusa's own flow explicitly passes `is_tax_inclusive` from the computed action to the adjustment:

```js
lineItemAdjustmentsToCreate.push({
    code: action.code,
    amount: itemAction.amount,
    is_tax_inclusive: itemAction.is_tax_inclusive,  // ← forwarded
    item_id: itemAction.item_id,
    promotion_id: promotionsMap.get(action.code)?.id,
});
```

And in `@medusajs/promotion/dist/utils/compute-actions/line-items.js`, the promotion's `is_tax_inclusive` is propagated to each computed action:

```js
computedActions.push({
    action: ComputedActions.ADD_ITEM_ADJUSTMENT,
    item_id: item.id,
    amount,
    code: promotion.code,
    is_tax_inclusive: promotion.is_tax_inclusive,  // ← from promotion
});
```

Our plugin needed to replicate this chain: `promotion.is_tax_inclusive` → `CartExtAdjustment.is_tax_inclusive` → `LineItemAdjustment.is_tax_inclusive`.

### Fix Applied

Three changes in `compute-non-standard-adjustments.ts`:

1. **Fetch `is_tax_inclusive` from the promotion** — added `"is_tax_inclusive"` to the `query.graph` fields for the promotion entity (line 42).

2. **Store `is_tax_inclusive` on the ext adjustment record** — added `is_tax_inclusive: (promo as any).is_tax_inclusive ?? false` to the `createCartExtAdjustments` call (line 147).

3. **Forward `is_tax_inclusive` and `metadata` in all three transfer paths** — added both fields to `preservedAdjustments`, item-specific `customAdjustments`, and cart-wide spread `customAdjustments`.

---

## Problem 2: `code` Field Prefix Diverges from Medusa Convention

### Current State

The `code` field on `CartExtAdjustment` (and consequently the `LineItemAdjustment`) uses a prefixed format:

| Source | Code format | Example |
|---|---|---|
| Manual adjustment | `MANUAL_<id_suffix>` | `MANUAL_01KT7AWZ5R` |
| Bundle promotion | `BUNDLE_<promo_code>` | `BUNDLE_WC_BUNDLE_5` |
| Buy-get repeat | `BUYGET_REPEAT_<promo_code>` | `BUYGET_REPEAT_BG_FREE` |

Medusa's native convention is to use the raw promotion code as the adjustment code:

```js
// @medusajs/promotion/dist/utils/compute-actions/line-items.js:90
code: promotion.code  // → "WC_BUNDLE_5"
```

### Why the Prefix Was Originally Added

The PRD (`PRD-custom-adjustments-and-promotion-modes.md`) documents two reasons for custom `code` values:

1. **Manual adjustments require a synthetic code** — they have no promotion behind them, and Medusa's `addLineItemAdjustments` requires a `code` value. `MANUAL_<id>` was invented for this purpose. This remains valid and should be kept.

2. **Storefront identification** — the PRD's "Out of Scope" section (line 325) mentions that consumers can check `code` prefix to identify custom adjustments. However, the `source` field on `CartExtAdjustment` (`"manual"` | `"bundle"` | `"buyget_repeat"`) already serves this purpose, making the prefix redundant for identification.

Notably, the PRD's data model table (line 86) describes the `code` field as:
> `code` — Promotion code for bundle/buyget, auto-generated `MANUAL_<id>` for manual

This implies the intent was to use the raw promotion code for bundle/buyget, not a prefixed version. The implementation diverged from the spec.

### Problems Caused by the Prefix

**1. Breaks Medusa's assumption that `adjustment.code === promotion.code`**

Medusa's `prepareAdjustmentsFromPromotionActionsStep` collects `computedPromotionCodes` from adjustment codes to determine which promotions are actively applied to the cart:

```js
const computedPromotionCodes = [
    ...lineItemAdjustmentsToCreate,
    ...shippingMethodAdjustmentsToCreate,
].map((adjustment) => adjustment.code);
```

Our prefixed code (`BUNDLE_WC_BUNDLE_5`) would not match the promotion code (`WC_BUNDLE_5`) if this path were ever used to reconcile our adjustments.

**2. Checkout validation fragility**

`validate-checkout.ts` checks that every `CartExtAdjustment.code` exists in Medusa's `LineItemAdjustment` codes:

```js
for (const adj of cartExtAdjustments) {
    const code = (adj as any).code as string
    if (!allMedusaCodes.has(code)) {
        throw new MedusaError(...)
    }
}
```

This works today because our `applyExtAdjustmentsToCart` writes the same prefixed code to both tables. But if `updateCartPromotionsWorkflow` re-runs between our write and checkout (e.g., triggered by a shipping method change), Medusa would overwrite our adjustment with its own computation using `code: "WC_BUNDLE_5"`. Then at checkout, we'd look for `BUNDLE_WC_BUNDLE_5`, not find it, and **block checkout** with "Cart adjustments are out of sync."

Using the raw promotion code eliminates this fragility — both Medusa's native adjustment and our custom adjustment would have the same code, so the sync check passes regardless of ordering.

**3. Storefront display**

Any storefront rendering the discount code from the cart adjustment would show `BUNDLE_WC_BUNDLE_5` instead of the human-readable `WC_BUNDLE_5`.

### Safety Analysis: Removing the Prefix for Bundle/Buyget

Every code path that uses the `code` field was audited for breakage if bundle/buyget adjustments use the raw promotion code:

| Location | How `code` is used | Impact |
|---|---|---|
| `validate-checkout.ts:43` | `allMedusaCodes.has(code)` — sync check | **Safe** — both sides would use `WC_BUNDLE_5` |
| `[id]/route.ts:76` (PATCH) | `adj.code !== code` to filter | **N/A** — guarded by `source !== "manual"` at line 58 |
| `[id]/route.ts:150` (DELETE) | `adj.code !== code` to filter | **N/A** — guarded by `source !== "manual"` at line 132 |
| `batch/route.ts:98-101` (PATCH) | `!codes.has(adj.code)` to filter | **N/A** — guarded by `source !== "manual"` at line 84 |
| `batch/route.ts:151-159` (DELETE) | `!codes.has(adj.code)` to filter | **N/A** — guarded by `source !== "manual"` at line 143 |
| `applyExtAdjustmentsToCart:192-194` | Filters by `promotion_id`, not `code` | **Safe** — code not involved |
| `deduplicateExtAdjustments:257` | Deduplicates by `${promotion_id}:${item_id}` | **Safe** — code not involved |
| `computeNonStandardAdjustments:143` | Where the code is generated | **Change site** |
| Tests (spec file) | Assert against prefixed codes | **Test updates needed** |

**Key finding:** All admin CRUD routes that filter by `code` are restricted to `source: "manual"` adjustments. Bundle/buyget adjustments never enter those code paths. And the critical `applyExtAdjustmentsToCart` logic uses `promotion_id` for filtering, not `code`.

**Potential concern — code collision with native Medusa adjustments:** After the change, both Medusa's native `computeActions` and our bundle calculator would produce adjustments with `code: "WC_BUNDLE_5"`. However, `applyExtAdjustmentsToCart` already strips native adjustments for custom-mode promotions by `promotion_id` before adding our custom adjustment, so no duplication occurs.

### Decision: Deferred

The prefix removal for bundle/buyget is **approved but deferred** to a separate PR. Reasons:

1. The `is_tax_inclusive` fix is urgent (causes incorrect totals in tax-inclusive regions) and should ship independently.
2. The prefix change requires updating test assertions and should be tested against a real Medusa instance with both standard and non-standard promotions active simultaneously.
3. The `MANUAL_*` prefix is kept — manual adjustments have no promotion code to use.

### Implementation Plan (When Executed)

1. **Change `compute-non-standard-adjustments.ts:143`** — from `\`${promotionMode.toUpperCase()}_${promo.code}\`` to `promo.code`.
2. **Update test assertions** in `compute-non-standard-adjustments.unit.spec.ts` — all `BUNDLE_BUNDLE10` → `BUNDLE10`, `BUYGET_REPEAT_BG_FREE` → `BG_FREE`, etc.
3. **No migration needed** — `CartExtAdjustment` rows are ephemeral (tied to active carts, not persisted to orders). The `code` stored in `CartExtAdjustment` is re-computed on every cart update cycle, so existing rows will naturally get the new format.
4. **Update PRD out-of-scope section** — remove the mention of `code` prefix as a storefront identification mechanism. Document that `source` field on `CartExtAdjustment` is the correct way to identify adjustment origin.
5. **Test with concurrent standard + non-standard promotions** — verify that a cart with both a standard Medusa promotion and a bundle promotion handles `code` correctly when `updateCartPromotionsWorkflow` and `applyExtAdjustmentsToCart` run in sequence.

---

## Full Field Parity Reference

Medusa's `LineItemAdjustment` model fields vs what our `applyExtAdjustmentsToCart` now passes (after the fix):

| Field | Medusa model | preservedAdjustments | customAdjustments (item) | customAdjustments (spread) |
|---|---|---|---|---|
| `id` | PK | Passed | Not passed (new) | Not passed (new) |
| `code` | text | Passed | Passed | Passed |
| `amount` | bigNumber | Passed | Passed | Passed |
| `is_tax_inclusive` | boolean | **Passed (fixed)** | **Passed (fixed)** | **Passed (fixed)** |
| `description` | text | Passed | Passed | Passed |
| `promotion_id` | text | Passed | Passed | Passed |
| `provider_id` | text | Passed | Passed | Passed |
| `metadata` | json | **Passed (fixed)** | **Passed (fixed)** | **Passed (fixed)** |
| `item_id` | FK | Passed | Passed | Passed |

---

## Consequences

- Cart totals are now correct for tax-inclusive pricing regions (Israel, EU, etc.) when bundle or buy-get repeat promotions are active.
- Native Medusa promotions with `is_tax_inclusive: true` no longer lose that flag when our plugin re-applies adjustments via `setLineItemAdjustments`.
- Adjustment `metadata` is preserved through the transfer — previously silently dropped.
- The `code` prefix remains for now, creating a known deviation from Medusa convention. A follow-up PR will align bundle/buyget codes with Medusa's raw promotion code format.
- Manual adjustments (`MANUAL_*`) are unaffected by the planned code change — they have no promotion and require a synthetic code.

---

## Lessons Learned

1. **Mirror all fields, not just "important" ones.** When replicating a Medusa model for a shadow table, every field must flow through the transfer path — even fields that seem unused today (`metadata`) or have sensible defaults (`is_tax_inclusive: false`). The default is only safe when it matches the source data.
2. **Tax-inclusive pricing reveals assumptions.** The bug was invisible in tax-exclusive regions where `is_tax_inclusive: false` was correct by coincidence. Always test with `is_tax_inclusive: true` regions.
3. **Convention divergence has compounding cost.** The `code` prefix seemed harmless but creates fragility in checkout validation, breaks storefront display expectations, and diverges from the Medusa ecosystem's assumptions. Staying close to Medusa conventions reduces integration surprises.
