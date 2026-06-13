# Bug Fix Decision Log

Single source of truth for all bug fixes in the promotion plugin. Each entry records what broke, why, where the fix lives, and what regresses if the fix is reverted. Consult this before modifying any shared code path.

**How to use this document:**
- Before changing a file listed in any fix entry, read the entries that touch it.
- The "Reverts if removed" section tells you what test to watch or behavior to verify.
- The "Test coverage" section tells you which automated test guards the fix. "None" = manual verification only (high regression risk).
- New bug fixes should be appended here with the next available ID.

## Test coverage summary

| Fix | Unit test | Integration test |
|-----|-----------|-----------------|
| BF-001 | `adjustment-calculator.unit.spec.ts` — `resolveExclusiveNonStandard` | None |
| BF-002 | None | None — structural (verify hook wiring) |
| BF-003 | None | `phantom-links.spec.ts` |
| BF-004 | None | None — covered by BF-002 |
| BF-007 | `adjustment-calculator.unit.spec.ts` — `bundle_size=1` | None |
| BF-008 | None | `zero-adjustment-promo-bugs.spec.ts` — BF-008 describe |
| BF-009 | `adjustment-calculator.unit.spec.ts` — `no rounding loss` | None |
| BF-010 | `adjustment-calculator.unit.spec.ts` — `BF-010:` tests | None |
| BF-011 | None | `admin-adjustment-tax-inclusive.spec.ts` |
| BF-012 | `adjustment-calculator.unit.spec.ts` — `BF-012:` tests | `zero-adjustment-promo-bugs.spec.ts` — BF-012 describe |
| BF-013 | `scale-percentage-adjustments.unit.spec.ts` | None |
| BF-014 | None | `zero-adjustment-promo-bugs.spec.ts` — BF-014 describe |

---

## Index by file

| File | Fix IDs |
|------|---------|
| `src/lib/adjustment-calculator.ts` | BF-001, BF-009, BF-010, BF-012 |
| `src/lib/compute-non-standard-adjustments.ts` | BF-001, BF-002, BF-008, BF-012, BF-013 |
| `src/lib/restore-evicted-standard-promos.ts` | BF-003, BF-008, BF-010, BF-012, BF-014 |
| `src/lib/evaluate-auto-apply-promotions.ts` | BF-002, BF-003 |
| `src/subscribers/sync-non-standard-adjustments.ts` | BF-002, BF-008 |
| `src/subscribers/cart-updated.ts` | BF-002, BF-008 |
| `src/api/store/carts/[id]/line-items/route.ts` | BF-002 |
| `src/api/admin/promotion-ext-configs/validators.ts` | BF-007 |
| `src/api/admin/cart-adjustments/[cart_id]/route.ts` | BF-011 |
| `src/api/admin/cart-adjustments/[cart_id]/[id]/route.ts` | BF-011 |
| `src/api/admin/cart-adjustments/[cart_id]/batch/route.ts` | BF-011 |
| `src/lib/adjustment-spread.ts` | BF-010 |

---

## BF-001: Discount stacking / negative cart total

**Date:** 2026-06-08
**PRD ref:** Entry 1
**Severity:** Critical

**Symptom:** Product in multiple promotions gets all discounts stacked. Cart total goes negative (e.g., -7 ILS).

**Root cause:** `computeNonStandardAdjustments` processed every non-standard promotion independently from the item's original price. No shared budget, no exclusivity. `deduplicateExtAdjustments` only prevented same-promo duplicates, not cross-promo stacking. Final merge in `applyExtAdjustmentsToCart` had no per-item cap.

**Fix:** Two-phase adjustment resolution:
- Phase 1: `resolveExclusiveNonStandard()` in `adjustment-calculator.ts` — greedy algorithm sorts non-standard promos by total savings DESC, claims items for highest-saving promo first, skips promos whose items are already claimed. Non-standard promos are mutually exclusive per item.
- Phase 2: `capAdjustmentsToSubtotal()` in `adjustment-calculator.ts` — sequential capping ensures standard promos stack on remaining budget after non-standard, never exceeding item subtotal.

**Files changed:** `adjustment-calculator.ts` (added `resolveExclusiveNonStandard`, `capAdjustmentsToSubtotal`), `compute-non-standard-adjustments.ts` (calls greedy filter, passes winners to cap).

**Reverts if removed:** Multiple non-standard promos on same item stack without limit. Cart total goes negative.

---

## BF-002: Cart race condition during rapid mutations

**Date:** 2026-06-08
**PRD ref:** Entry 2
**Severity:** Critical

**Symptom:** Rapid add-to-cart produces inconsistent discounts, partial adjustments, duplicate adjustments, or negative totals. Correct on page refresh.

**Root cause:** Plugin promotion logic ran at three invocation points with different locking: (1) workflow hook (distributed lock), (2) route handler (no lock), (3) subscriber (no lock). Post-workflow route handler could interleave with the next request's workflow, causing stale reads/writes.

**Fix:** Moved all promotion logic (`evaluateAutoApplyPromotions` + `computeNonStandardAdjustments`) into the `beforeRefreshingPaymentCollection` workflow hook. Rewrote `evaluateAutoApplyPromotions` to use direct link manipulation (`remoteLink.create`/`dismiss`) instead of `updateCartPromotionsWorkflow.run()` (which would deadlock inside the hook). Route handler simplified to just `addToCartWorkflow` + `refetchCart`.

**Files changed:** `sync-non-standard-adjustments.ts` (hook now calls both functions), `evaluate-auto-apply-promotions.ts` (rewritten to use direct links), `store/carts/[id]/line-items/route.ts` (removed lines 34-35), `cart-updated.ts` (kept as async fallback).

**Reverts if removed:** Any promotion logic outside the workflow hook reintroduces the race window. Concurrent writers interleave.

**Key constraint:** `evaluateAutoApplyPromotions` MUST NOT call `updateCartPromotionsWorkflow.run()` inside the hook — it deadlocks (see ADR-0007). Direct link manipulation is required.

---

## BF-003: Phantom promotion links

**Date:** 2026-06-08
**PRD ref:** Entry 3
**Severity:** Medium

**Symptom:** Promotions linked to cart with no adjustments (e.g., 15 promos linked but only 1 produces a discount). Confuses storefront display.

**Root cause:** Two code paths linked promos without checking `target_rules`:
1. `restoreEvictedStandardPromos` linked promos before computing adjustments. Promos whose `target_rules` didn't match cart items got linked but produced 0 adjustments.
2. `evaluateAutoApplyPromotions` checked activation rules and ext rules but not `application_method.target_rules`.

**Fix:**
1. `restoreEvictedStandardPromos`: reordered — `computeActions` runs BEFORE `remoteLink.create`. Only promos that produce `addItemAdjustment` actions get linked.
2. `evaluateAutoApplyPromotions`: added `target_rules` to promotion query + `filterEligibleItems` check before linking.

**Files changed:** `restore-evicted-standard-promos.ts` (compute-first, link-second), `evaluate-auto-apply-promotions.ts` (added target_rules filtering).

**Reverts if removed:** Promos get linked to carts where no items match their target_rules. `cart.promotions` fills with irrelevant promos.

---

## BF-004: Duplicate adjustment ID error

**Date:** 2026-06-08
**PRD ref:** Entry 4 (sub-case of BF-002)
**Severity:** Medium

**Symptom:** `"Cart line item adjustment with id: caliadj_..., already exists."` error on add-to-cart.

**Root cause:** Race condition (BF-002). Two concurrent code paths wrote the same adjustment ID — `preservedAdjustments` carried the original `id` field, and both the workflow's `createLineItemAdjustmentsStep` and the route's `setLineItemAdjustments` tried to write it.

**Fix:** Covered by BF-002. Moving all logic into the hook eliminates concurrent writers.

**Reverts if removed:** Same as BF-002.

---

## BF-005: False report — standard auto-apply "broken"

**Date:** 2026-06-08
**PRD ref:** Entry 5

**Not a bug.** Reporter saw promos linked with `discount_total=0` and concluded standard auto-apply was broken. Actual cause was BF-003 (phantom links). Standard auto-apply works correctly — `is_automatic` flag is irrelevant because the plugin explicitly passes codes to `computeActions`.

---

## BF-006: Bundle adjustments duplicated / cart goes negative during rapid adds

**Date:** 2026-06-08
**PRD ref:** Entry 6 (combination of BF-001 + BF-002)
**Severity:** Critical

**Symptom:** Bundle adjustment appears 3x on same item during rapid adds. Cart total = -10.10 ILS.

**Root cause:** Bundle computed and written multiple times from concurrent execution paths (BF-002 race), and stacked with itself (BF-001 no exclusivity).

**Fix:** Covered by BF-001 (exclusive non-standard) + BF-002 (single writer in hook).

**Reverts if removed:** Same as BF-001 + BF-002.

---

## BF-007: bundle_size=1 blocked by validation

**Date:** 2026-06-08
**PRD ref:** Entry 7
**Type:** Feature — not a bug fix

**Symptom:** 19 WooCommerce promotions couldn't be represented. They set a target price per individual item, requiring `bundle_size=1`, but validation enforced `min(2)`.

**Fix:** Changed `z.number().int().min(2)` to `.min(1)` in `validators.ts` line 25. No calculator changes — `computeBundle` already handles `bundle_size=1` correctly (each item becomes its own "bundle").

**Files changed:** `src/api/admin/promotion-ext-configs/validators.ts`.

**Reverts if removed:** `bundle_size=1` promotions rejected by API validation. 19 promotions can't be created.

---

## BF-008: Freshly-linked standard promos get no adjustments on first link

**Date:** 2026-06-08
**PRD ref:** Entry 8 (regression from BF-002)
**Severity:** Medium

**Symptom:** Standard auto-apply promo linked but `discount_total=0` on first cart mutation. Correct on second mutation.

**Root cause:** BF-002 refactor moved `evaluateAutoApplyPromotions` into hook, which fires AFTER `updateCartPromotionsWorkflow(REPLACE)`. On a fresh cart, REPLACE runs with no promos linked → no adjustments. Hook then links promos, but `computeActions` already ran. `restoreEvictedStandardPromos` skipped these promos because they were linked (not evicted).

**Fix:** Thread `freshlyLinkedCodes` from `evaluateAutoApplyPromotions` through to `restoreEvictedStandardPromos`. For promos in this set: don't skip even though linked, compute adjustments via `computeActions`, skip `remoteLink.create` (already linked).

**Files changed:** `sync-non-standard-adjustments.ts` (passes `added` as `freshlyLinkedCodes`), `compute-non-standard-adjustments.ts` (threads through), `restore-evicted-standard-promos.ts` (accepts `freshlyLinkedCodes` option).

**Reverts if removed:** Standard auto-apply promos produce 0 adjustments on first cart mutation. Self-heals on next mutation but customers see wrong total initially.

**Interaction:** Depends on BF-002 (hook architecture). Must be implemented after BF-002.

---

## BF-009: Rounding loss in budget cap

**Date:** 2026-06-08
**PRD ref:** Entry 9
**Severity:** Low-Medium

**Symptom:** Combined non-standard + standard promotions lose 1-3 currency units to rounding. Customer pays slightly more than they should.

**Root cause:** `capAdjustmentsToSubtotal` used proportional scaling with `Math.floor`. Each adjustment independently floored, accumulating rounding losses.

**Fix:** Replaced proportional scaling with sequential capping — sort other adjustments by amount DESC, apply each as `min(amount, remaining)`. No `Math.floor`, no proportional scaling. Highest-value adjustment goes first in full; last absorbs shortfall.

**Files changed:** `adjustment-calculator.ts` (`capAdjustmentsToSubtotal` rewritten).

**Reverts if removed:** Small rounding losses (1-3 units) when non-standard + standard promos combine on same item.

---

## BF-010: Wrong tax basis + Math.floor in calculators

**Date:** 2026-06-08
**PRD ref:** Entry 10
**Severity:** High

**Symptom:** Three manifestations: (1) negative cart total with percentage promos on tax-inclusive items, (2) bundle discount shortfall with tax-inclusive target price, (3) `Math.floor` losing up to ~1 unit per adjustment.

**Root cause:** Calculators assumed amounts in minor currency units and tax doesn't matter. Wrong when store uses major units (EUR/ILS) with tax-inclusive pricing.

**Fix:**
1. Added `subtotal` (tax-exclusive) field to `EligibleItem` interface.
2. Pass `is_tax_inclusive` to calculator functions.
3. Calculators pick correct price basis per context: percentage always tax-exclusive, fixed/bundle uses tax basis matching `is_tax_inclusive`.
4. Removed all `Math.floor` on monetary amounts — direct multiplication with remainder correction on last item.
5. `restoreEvictedStandardPromos` builds clean context with tax-exclusive subtotal.

**Files changed:** `adjustment-calculator.ts` (calculators, `spreadCartAdjustment`), `compute-non-standard-adjustments.ts` (tax line queries, `EligibleItem` construction), `restore-evicted-standard-promos.ts` (clean context subtotal), `adjustment-spread.ts` (removed floor).

**Reverts if removed:** Negative cart totals with percentage promos on tax-inclusive items. Bundle discounts miscalculated by the tax delta. Small amounts lost to Math.floor.

**Key invariant:** Percentage promos ALWAYS use tax-exclusive basis (matches Medusa native). Fixed/bundle promos use basis matching `is_tax_inclusive` flag.

---

## BF-011: Admin routes drop is_tax_inclusive on line item adjustments

**Date:** 2026-06-08
**PRD ref:** Entry 11
**Severity:** High

**Symptom:** Manual cart-wide adjustment of 10 EUR with `is_tax_inclusive: true` produces wrong total (5.70 instead of 7.50). Medusa defaults `is_tax_inclusive` to false when not provided.

**Root cause:** Admin CRUD route handlers (`POST`, `PATCH`, `DELETE`) wrote line item adjustments via `cartModule.addLineItemAdjustments`/`setLineItemAdjustments` without forwarding `is_tax_inclusive` and `metadata` from the ext adjustment record.

**Fix:** Forward `is_tax_inclusive` (and `metadata` for PATCH/DELETE) in all six code locations across three admin route files.

**Files changed:** `admin/cart-adjustments/[cart_id]/route.ts`, `admin/cart-adjustments/[cart_id]/[id]/route.ts`, `admin/cart-adjustments/[cart_id]/batch/route.ts`.

**Reverts if removed:** Tax-inclusive manual adjustments treated as tax-exclusive. Cart totals wrong in tax-inclusive regions.

---

## BF-012: Zero-amount adjustments written and promos linked with no discount

**Date:** 2026-06-11
**Severity:** Medium
**Discovered during:** Testing of BF-001/BF-009 budget cap behavior

**Symptom:** Two auto-apply standard promos (both fixed 33 EUR off, max_quantity=1) targeting the same products. First promo exhausts the budget. Second promo gets linked to cart with 0-amount adjustments on all items. On vanilla Medusa, the second promo would NOT be linked.

Also: after removing items so budget is exhausted, a promo stays linked with a 0-amount adjustment written to the cart.

**Root cause:** Three issues:
1. `capAdjustmentsToSubtotal` returned 0-amount adjustments instead of filtering them out (amount capped to 0 when budget exhausted, but still included in result array).
2. `setLineItemAdjustments` writes whatever it's given — doesn't auto-unlink promos. So 0-amount adjustments got persisted.
3. `evaluateAutoApplyPromotions` re-links promos that pass eligibility + target_rules even when they'd produce 0 adjustments (no budget awareness).

**Fix (three change points):**
1. `capAdjustmentsToSubtotal` — filter out adjustments where `cappedAmount <= 0` (skip instead of include).
2. `applyExtAdjustmentsToCart` — after writing adjustments, check which `freshlyLinkedCodes` have 0 total adjustments in the final capped output. Unlink them via `remoteLink.dismiss`.
3. `restoreEvictedStandardPromos` — filter out `amount <= 0` entries from returned array (defensive).

**Files changed:** `adjustment-calculator.ts` (capAdjustmentsToSubtotal filter), `compute-non-standard-adjustments.ts` (post-write unlink of zero-adjustment promos), `restore-evicted-standard-promos.ts` (filter zero-amount restored adjustments).

**Reverts if removed:**
- Fix 1 reverted: 0-amount adjustments written to cart. Promos appear linked with no discount.
- Fix 2 reverted: freshly-linked promos that produce 0 adjustments stay linked. Phantom links return (related to BF-003).
- Fix 3 reverted: 0-amount restored adjustments propagated (minor, downstream cap catches them).

**Interaction:** Fix 2 exposed BF-014 (budget-context bug). Fix 2 depends on BF-008 (`freshlyLinkedCodes` parameter).

---

## BF-013: Percentage standard promos not scaled to post-bundle remaining

**Date:** 2026-06-08
**PRD ref:** Entry 1 (Phase 2 detail)
**Severity:** Medium

**Symptom:** When a bundle reduces an item's effective price and a percentage standard promo also applies, the percentage is computed on the original price (too high) instead of the post-bundle remaining.

**Root cause:** Medusa's `computeActions` computes percentage discounts on the item's original subtotal, unaware of non-standard adjustments. A 10% promo on a 50 EUR item produces 5 EUR even if a bundle already discounted it to 40 EUR (should be 4 EUR).

**Fix:** `scalePercentageAdjustmentsForBundleRemaining` in `compute-non-standard-adjustments.ts`. For percentage-type standard adjustments on items with bundle discounts: compute `scale = (subtotal - bundle_discount) / subtotal`, multiply adjustment amount by scale. Tax-basis conversion applied when bundle's `is_tax_inclusive` differs from the standard promo's.

**Files changed:** `compute-non-standard-adjustments.ts` (added `scalePercentageAdjustmentsForBundleRemaining`).

**Reverts if removed:** Percentage promos over-discount items that also have bundle promos. Can push total discount above item price (caught by cap, but customer gets wrong proportional discount).

**Key invariant:** Only percentage-type standard adjustments are scaled. Fixed-type are left unchanged (flat amounts, not proportional to base).

---

## BF-014: Freshly-linked promo picks same item as existing promo (budget-context bug)

**Date:** 2026-06-11
**Severity:** Medium
**Discovered during:** Testing BF-012 with allocation=Once promos

**Symptom:** Two auto-apply standard promos (Once, max_quantity=1, fixed 33 EUR). Cart has 2 items. Expected: each promo takes a different item (total discount = both items free). Actual: both promos compute on the same item (cheapest), second gets capped to 0 and unlinked. One item gets no discount.

**Root cause:** `restoreEvictedStandardPromos` computed freshly-linked promo (33off2) via `computeActions(["33off2"], cleanContext)` — passing ONLY the freshly-linked code. The clean context has no existing adjustments. Medusa's ONCE allocation picks the cheapest item. Since 33off1 isn't in the code list, Medusa has no shared budget context — 33off2 picks the same cheapest item that 33off1 already claimed in `preservedAdjustments`.

**Why this wasn't visible before BF-012:** Before BF-012 Fix 2, 33off2 stayed linked with a 0-amount adjustment. Now Fix 2 correctly unlinks it, making the missing discount obvious.

**Fix:** When calling `computeActions`, include ALL linked standard promo codes (not just evicted/freshly-linked) for budget context. Added `budgetContextCodes` collection: promos that are linked and NOT freshly-linked get their codes collected during the evaluation loop. `computeActions` receives `[...evictedCodes, ...budgetContextCodes]`. Budget-context promo actions are automatically excluded from the returned adjustments because `promoCodeToId` only maps evicted promo codes.

**Files changed:** `restore-evicted-standard-promos.ts` (collect `budgetContextCodes`, pass to `computeActions`).

**Reverts if removed:** Freshly-linked ONCE-allocation promos pick the same item as existing promos instead of distributing across items. Second promo produces 0 adjustments and gets unlinked. Customer misses a discount they should receive.

**Interaction:** Surfaced by BF-012 Fix 2. Depends on BF-008 (`freshlyLinkedCodes` parameter).

---

## Interaction graph

```
BF-002 (race fix / hook architecture)
  |
  +-- BF-004 (duplicate ID — fixed by BF-002)
  +-- BF-006 (bundle duplication — fixed by BF-001 + BF-002)
  +-- BF-008 (freshly-linked promos — regression from BF-002)
        |
        +-- BF-012 (zero-amount adjustments — depends on BF-008 freshlyLinkedCodes)
              |
              +-- BF-014 (budget-context bug — surfaced by BF-012 Fix 2)

BF-001 (stacking / two-phase resolution)
  |
  +-- BF-009 (rounding — in capAdjustmentsToSubtotal, introduced by BF-001)
  +-- BF-013 (percentage scaling — Phase 2 detail of BF-001)

BF-003 (phantom links) — independent
BF-007 (bundle_size=1) — independent
BF-010 (tax basis) — independent
BF-011 (admin routes) — independent
```
