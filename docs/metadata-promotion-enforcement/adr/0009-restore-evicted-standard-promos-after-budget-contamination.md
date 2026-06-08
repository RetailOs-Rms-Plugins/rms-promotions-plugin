# ADR-0009: Restore Evicted Standard Promotions After Budget Contamination

**Status:** Proposed  
**Date:** 2026-06-07

---

## Context

Medusa's `computeActions` processes all promotions on a cart in a single pass, using a shared `appliedPromotionsMap` to track how much discount budget has been consumed per item. Promotions are sorted by `application_method.value` descending, so higher-value promotions are computed first.

Non-standard promotions (bundle, buy-get repeat) carry a native `application_method.value` that does not reflect the actual discount. For a bundle promotion like "3 for 25", the native value is 25 (the bundle target price), but Medusa's native engine interprets this as a 25-per-unit fixed discount. With `allocation: "once"` (internally treated as `"each"` with a quota equal to `max_quantity`), this applies a 25-unit-currency discount to each item, capped at the item's price.

When item prices are lower than the native value (common for bundles — a "3 for 25" bundle implies individual items cost more than ~8.33), the native computation fully consumes every item's budget in the shared map. When a subsequent standard promotion (e.g., 10% off) is computed, the remaining budget (`lineItemsAmount`) is zero or negative. The promotion produces zero adjustments, is excluded from `computedPromotionCodes`, and `updateCartPromotionsStep(REPLACE)` **removes it from the cart entirely**.

The plugin's `applyExtAdjustmentsToCart` later replaces the wrong native bundle adjustments with correct custom ones, but the standard promotion has already been unlinked from the cart — there are no adjustments to preserve.

`evaluateAutoApplyPromotions` re-adds the evicted promotion on the next cycle, but `updateCartPromotionsWorkflow` runs again and evicts it again — creating a perpetual add/evict loop where the standard promotion never sticks.

### Why ADR-0004 (`value: 1`) does not fully prevent this

ADR-0004 prescribes `value: 1` for non-standard promotions to minimize native interference. With `value: 1`, budget consumption is 1 per unit — small enough that most standard promotions survive. However:

- Items priced at or below 1 (in the cart's currency) are still fully consumed.
- Zero-decimal currencies (JPY, KRW) make `value: 1` a full-unit discount.
- Merchants may not follow the guidance (the admin UI does not currently enforce it).
- Multiple non-standard promotions on the same cart multiply the budget drain.

A defense-in-depth fix is needed regardless of the native value.

---

## Options

### Option A — Move value to `mode_config`, set native value to a dummy

Store the real discount value in a new `mode_config` field (e.g., `bundle_price`). Set `application_method.value` to a dummy number — either 0 or a small sentinel like 0.01. The plugin reads from `mode_config`; Medusa's native computation produces zero or negligible adjustments.

**Rejected because:**
- **`value: 0` is not viable.** Medusa does not write a promotion to the cart when `application_method.value` is 0 (documented in ADR-0004). The promotion becomes invisible to `cart.promotions`, making it impossible for the plugin to detect and compute custom adjustments.
- **A non-zero dummy is bad practice.** Setting `value` to an arbitrary number (0.01, 1, etc.) that the system never actually uses creates a field that lies to anyone reading it — merchants in the admin UI, developers inspecting the database, and API consumers reading the promotion response. A field that exists solely to satisfy a framework constraint while carrying no real meaning is a maintenance trap: future developers will not know whether the value matters, clients will see a meaningless amount, and any Medusa update that changes how `value` is interpreted could silently break behavior. The native `application_method.value` should always reflect the promotion's actual semantics.
- Does not handle zero-decimal currencies (JPY, KRW) where small sentinels round to 0 — same problem as `value: 0`.
- Requires migrating the value field for existing promotions, changing the admin UI, and updating CONTEXT.md — significant churn for a solution that introduces its own problems.

### Option B — Restore evicted standard promotions after non-standard computation

After `computeNonStandardAdjustments` replaces native adjustments with correct custom ones, detect standard auto-apply promotions that were evicted from the cart, re-link them, compute their adjustments independently using a clean cart context (no pre-consumed budget), and merge everything.

**Chosen because:**
- Fully solves the problem regardless of the native value — works with `value: 1`, `value: 25`, or any other amount.
- No changes to Medusa's native promotion data or the admin UI.
- The independent computation uses `promotionService.computeActions` with a clean context, so it applies Medusa's own logic (target rules, allocation, budget limits) correctly.
- Idempotent — if no promos were evicted, no extra work is done.

### Option C — Override `computeActions` via module extension

Extend the promotion module service to exclude non-standard promotions from the shared budget map.

**Rejected because:**
- Requires extending a Medusa core module service, which couples the plugin to Medusa's internal `computeActions` implementation.
- `computeActions` is a complex function with budget tracking, buy-get logic, and rule evaluation. Overriding it safely would require re-implementing or monkey-patching internals.

---

## Decision

After `computeNonStandardAdjustments` completes (custom adjustments are merged), a new function `restoreEvictedStandardPromos` runs. It:

1. **Detects evicted promos.** Lists all auto-apply standard-mode `PromotionExtConfig` entries. Evaluates which should be active for the cart (same rule evaluation as `evaluateAutoApplyPromotions`). Compares against the cart's current promotion links. Any promo that passes rules but is not linked = evicted.

2. **Re-links evicted promos to the cart.** Uses the remote link module to directly add the cart-promotion relationship, bypassing `updateCartPromotionsWorkflow` (which would re-trigger budget contamination).

3. **Computes their adjustments independently.** Calls `promotionService.computeActions(evictedCodes, cleanCartContext)` where `cleanCartContext` is the current cart with **adjustments stripped from items**. This ensures:
   - `codeAdjustmentMap` is empty (no removal actions generated).
   - `appliedPromotionsMap` starts fresh (full budget available).
   - Only the evicted standard promo codes are evaluated (no non-standard budget contamination).

4. **Extracts and creates adjustments.** Filters the returned actions for `ADD_ITEM_ADJUSTMENT`, maps them to adjustment objects, and adds them to the cart's line item adjustments alongside the existing custom adjustments.

This function is called from all three invocation points of `computeNonStandardAdjustments`: route overrides (sync), the `beforeRefreshingPaymentCollection` hook, and the `cart.updated` subscriber.

---

## Consequences

- **Extra computation per cart update.** When non-standard promotions are active, one additional `computeActions` call runs per cart update (only if eviction is detected). This is bounded by the number of standard auto-apply promotions and is skipped entirely when no promos were evicted.
- **Direct link manipulation.** Re-linking promos via the remote link module bypasses `updateCartPromotionsWorkflow`, which means the link is not validated by Medusa's promotion lifecycle (status, dates, campaign budget). This is acceptable because the plugin's `evaluateAutoApplyPromotions` already performs these checks via `passesNativeRules` and `evaluatePromotion`.
- **Recurring evict/restore cycle.** Every `refreshCartItemsWorkflow` run will evict the standard promo (via `updateCartPromotionsWorkflow`), and the subsequent hook/route/subscriber will restore it. This is a steady-state overhead, not a correctness issue. The cycle converges in one iteration.
- **ADR-0004 remains relevant.** Using `value: 1` still reduces the budget drain and makes eviction less likely for most carts. This ADR provides defense-in-depth for cases where `value: 1` is insufficient or not followed.
