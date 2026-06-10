# PRD: Promotion Plugin Bug Fixes & Enhancements — June 2026

**Date:** 2026-06-08
**Status:** Draft
**Scope:** rms-promotions-extension-plugin

---

## Problem Statement

Production clients report multiple issues with the promotion plugin's cart adjustment logic. The core problems fall into three categories:

1. **Discount stacking with no cap** — When a product belongs to multiple promotions, all discounts apply simultaneously. Cart totals can go negative. There is no exclusivity logic, no budget cap, and no priority mechanism for non-standard promotions (bundle, buyget_repeat).

2. **Race conditions during cart mutations** — When adding items to cart rapidly, adjustments become inconsistent: partial discounts, duplicate adjustments, or negative totals. The root cause is that the plugin's post-workflow promotion logic runs outside Medusa's distributed workflow lock, allowing concurrent writers to interleave.

3. **Phantom promotion links** — Promotions get linked to the cart even when their target_rules don't match the cart's items. They appear in `cart.promotions` but produce no adjustments, confusing both the storefront display and merchants.

Additionally, 19 promotions migrated from WooCommerce cannot be represented because the plugin's bundle mode requires `bundle_size >= 2`, but these promotions set a target price per individual item.

---

## Solution

A single coordinated update that addresses all issues:

1. **Two-phase adjustment resolution** — Non-standard promotions (bundle, buyget_repeat) become mutually exclusive per item via a greedy best-deal algorithm. Standard promotions stack after, budget-capped at the remaining item amount (matching Medusa's native `appliedPromotionsMap` pattern).

2. **Move all promotion logic into the workflow hook** — Relocate `evaluateAutoApplyPromotions` and `computeNonStandardAdjustments` from the route handler into the `beforeRefreshingPaymentCollection` hook, using direct link manipulation (same pattern as ADR-0009's `restoreEvictedStandardPromos`). This eliminates the post-workflow gap that causes races.

3. **Fix restoreEvictedStandardPromos ordering** — Compute adjustments before linking promos, and only link promos that actually produce adjustments.

4. **Allow bundle_size = 1** — Change one validation rule to enable per-item target price promotions using the existing bundle calculator.

---

## Entry List

### Entry 1: Discount Stacking / Negative Cart Total

**Type:** Bug
**Severity:** Critical — cart totals go negative in production

**Symptom:** When a product belongs to multiple promotions, all discounts apply simultaneously. Example: "בירה הגיבור" is in 5+ promotions (bundle, percentage, fixed price). All discounts stack, cart total goes to -7₪.

**Root cause:** In `computeNonStandardAdjustments`, the loop at lines 75-156 processes every applied non-standard promotion independently. Each promotion computes adjustments from the item's **original price** — there is no shared budget map tracking how much discount has already been consumed per item. The `deduplicateExtAdjustments` function (lines 261-274) only prevents the same promotion from applying twice (key: `${promotion_id}:${item_id}`), but does nothing to prevent different promotions from stacking on the same item.

Additionally, `applyExtAdjustmentsToCart` merges three adjustment sources — preserved native, custom non-standard, and restored standard — without a final per-item cap (documented as a known gap in CONTEXT.md lines 129-132). Combined discount can exceed item price.

The `PromotionExtConfig` model has no `priority` or `exclusive` field. No cross-promotion conflict resolution exists.

**Why Medusa's native pattern doesn't apply directly:** Medusa's native `computeActions` tracks a shared `appliedPromotionsMap` per item across all promotions, sorted by `application_method.value` DESC. Each promotion takes whatever budget is left, capped at the item's remaining amount. This works for subtractive promotions (fixed/percentage off). But bundle promotions are **target-price operations** (they set a group price, not a discount amount). Two bundles on the same item are contradictory — one can set a price higher than what remains after the other. Bundles cannot safely stack with each other using the "apply all, budget-capped" pattern.

**How Medusa's native budget tracking actually works (verified from source code):**

Medusa's `computeActions` (in `@medusajs/promotion/dist/services/promotion-module.js`) does NOT do "pick one best deal." It does "apply all promotions, highest value first, capped at item subtotal":

1. Promotions are sorted by `application_method.value` DESC (line 375 in source).
2. A single `appliedPromotionsMap` (Map of item_id → total applied amount) is shared across ALL promotions.
3. For each promotion, for each eligible item: `remainingItemAmount = item.subtotal - appliedPromoValue`. If remaining ≤ 0, skip.
4. The adjustment amount is capped: `min(promotionValue, remainingAmount)`.
5. After applying: `appliedPromotionsMap.set(item.id, existingApplied + amount)`.
6. Result: multiple promotions CAN stack on one item — they just can't exceed the item's subtotal combined.

This was verified by reading the actual Medusa source at:
- `node_modules/@medusajs/promotion/dist/utils/compute-actions/line-items.js` (budget tracking per item)
- `node_modules/@medusajs/utils/dist/totals/promotion/index.js` (`calculateAdjustmentAmountFromPromotion` — caps at remaining)
- `node_modules/@medusajs/promotion/dist/services/promotion-module.js` (sort order, iteration)

**Important nuance about sort order:** Medusa sorts by the raw `application_method.value` field, not by computed discount amount. For standard promotions this roughly correlates (higher value = bigger discount). But for non-standard promotions, `value` means something different (bundle: target price, not discount). The plugin cannot use Medusa's sort-then-compute approach — it must **compute first, then sort by actual savings**, because the actual discount depends on the items' original prices.

**Why "apply all with cap" fails for bundles (concrete proof):**

Cart: 2 items at 50₪ each = 100₪
- Bundle A: "2 for 80₪" (saves 20₪)
- Standard B: "90% off" (saves 90₪)

If "apply all with cap" (standard B first by value, then bundle A):
- B: 90% of 100₪ = 90₪ off → remaining = 10₪
- A: bundle sets price to 80₪, but remaining is only 10₪ → bundle "discount" of 20₪ would RAISE the price from 10₪ back to 80₪

If bundle first, then standard on remaining:
- A: saves 20₪ → remaining = 80₪
- B: 90% of 80₪ = 72₪ → remaining = 8₪
- Total: 92₪ off, cart = 8₪ ✓

This proves bundles MUST be resolved first and exclusively — they are not compatible with the "apply all, cap at remaining" model because their discount is computed from original price and can exceed the remaining amount in a way that increases cost.

**Designed fix — Two-phase adjustment resolution:**

#### Phase 1 — Non-standard resolution (exclusive, one winner per item)

Non-standard promotions (bundle, buyget_repeat) are **target-price operations** — they set what items should cost, not how much to subtract. Two target-price promotions on the same item are contradictory (one can set a price higher than what remains after the other). Therefore: **only one non-standard promotion may apply to any given item.**

**Algorithm:**

```
Input:  List of applied non-standard promotions, each with computed adjustments
Output: Filtered list — at most one non-standard promotion per item

1. For each non-standard promotion, compute adjustments using original prices
   (existing computeBundle / computeBuyGetRepeat — no changes needed)

2. Sort promotions by total group savings DESC
   (total group savings = sum of all adjustment amounts for that promotion)

3. Initialize claimedItems = empty Set

4. For each promotion (highest savings first):
   a. Get the set of item_ids this promotion's adjustments touch
   b. If ANY item_id is already in claimedItems → SKIP this promotion entirely
      (the promotion's group is broken — a higher-savings promo already claimed one of its items)
   c. Otherwise → KEEP this promotion's adjustments
      Add all its item_ids to claimedItems

5. Return only the kept adjustments
```

**Why skip the entire promotion (step 4b) instead of just the overlapping items?**
A bundle "3 for 45₪" needs exactly 3 items to form. If 1 of its 3 items is already claimed, the bundle can't form with 2 items — the math changes (2 items at full price ≠ the bundle deal). The promotion is all-or-nothing for its group.

#### Phase 2 — Standard promotions (stackable, budget-capped at remaining)

Standard promotions (percentage off, fixed amount off) are **subtractive** — they can only reduce the price. Multiple standard promotions on the same item are safe as long as the total doesn't exceed the item's price. This matches Medusa's native `appliedPromotionsMap` behavior.

**Algorithm:**

```
Input:  List of applied standard promotions, per-item non-standard adjustments from Phase 1
Output: Per-item standard adjustments, capped so total never exceeds item subtotal

1. Initialize budgetMap = Map<item_id, consumed_amount>

2. For each item in the cart:
   consumed = sum of non-standard adjustments on this item (from Phase 1)
   budgetMap.set(item.id, consumed)

3. Medusa's native computeActions already handles standard promotions:
   - Sorts by application_method.value DESC
   - For each promotion, for each eligible item:
     remaining = item.subtotal - budgetMap.get(item.id)
     if remaining <= 0 → skip (item fully discounted)
     adjustment = min(computedDiscount, remaining)
     budgetMap.set(item.id, budgetMap.get(item.id) + adjustment)
   - This is exactly what Medusa does natively via appliedPromotionsMap

4. The plugin does NOT re-implement standard promotion computation.
   Standard promotions are computed by Medusa's native computeActions.
   The plugin's role is:
   a. Pass the correct non-standard adjustments (Phase 1 winners) to the budget
   b. Ensure the budget map includes non-standard consumed amounts
   c. Let Medusa handle the rest
```

**How Phase 1 and Phase 2 connect in the code:**

In `applyExtAdjustmentsToCart`, the final merge currently does:
```
finalAdjustments = [...preservedAdjustments, ...customAdjustments, ...restoredAdjustments]
```

After this fix:
```
1. customAdjustments = Phase 1 winners only (greedy-filtered non-standard)
2. preservedAdjustments = Medusa's native standard adjustments (already budget-capped
   within Medusa's own pass — BUT computed without knowledge of non-standard adjustments)
3. restoredAdjustments = evicted standard promos restored by restoreEvictedStandardPromos

Before writing finalAdjustments, apply a per-item cap:
  For each item:
    totalAdjustments = sum of all adjustments on this item (custom + preserved + restored)
    if totalAdjustments > item.subtotal:
      scale down preserved + restored adjustments proportionally to fit within
      (item.subtotal - customAdjustments) remaining budget
```

This per-item cap is the safety net that prevents negative totals even when the three adjustment sources (native, custom, restored) were computed independently.

#### Concrete Examples

**Example A — Two bundles on same items (Phase 1 exclusivity):**

Cart: Item X (50₪), Item Y (50₪) = 100₪
- Bundle A: "2 for 80₪" → savings = 20₪
- Bundle B: "2 for 60₪" → savings = 40₪

Phase 1:
1. Compute: A saves 20₪, B saves 40₪
2. Sort: B (40₪) > A (20₪)
3. B claims items X, Y → adjustments: X gets -20₪, Y gets -20₪
4. A needs items X, Y → both claimed → SKIP

Result: Only Bundle B applies. Cart = 60₪. ✓

**Example B — Bundle + buy-get on overlapping items (Phase 1 exclusivity):**

Cart: Item X (30₪), Item Y (30₪), Item Z (30₪) = 90₪
- Bundle: "3 for 70₪" → savings = 20₪
- Buy-get: "buy 2 get 1 free" → savings = 30₪ (cheapest item free)

Phase 1:
1. Compute: Bundle saves 20₪, Buy-get saves 30₪
2. Sort: Buy-get (30₪) > Bundle (20₪)
3. Buy-get claims X, Y, Z → adjustments: Z gets -30₪ (free), X and Y get 0₪
4. Bundle needs X, Y, Z → all claimed → SKIP

Result: Only buy-get applies. Cart = 60₪. ✓

**Example C — Bundle + standard percentage (Phase 1 + Phase 2):**

Cart: Item X (50₪), Item Y (50₪) = 100₪
- Bundle: "2 for 80₪" → savings = 20₪ (non-standard)
- Standard: "10% off" on all items (standard)

Phase 1: Bundle wins (only non-standard). X gets -10₪, Y gets -10₪.
Phase 2: Standard 10% applies on remaining budget per item:
- Item X: remaining = 50 - 10 = 40₪. 10% of 40₪ = 4₪.
- Item Y: remaining = 50 - 10 = 40₪. 10% of 40₪ = 4₪.

Result: Bundle saves 20₪ + Standard saves 8₪ = total discount 28₪. Cart = 72₪. ✓

**Example D — Multiple standard promotions stacking with budget cap (Phase 2 only):**

Cart: Item X (20₪)
- Standard A: "30₪ fixed off" (value=30, sorted first)
- Standard B: "50% off" (value=50, sorted second — Medusa sorts by raw value)
- Standard C: "5₪ off" (value=5, sorted third)

Phase 1: No non-standard promos. Skip.
Phase 2 (Medusa-native budget tracking):
- A: wants 30₪ off, remaining = 20₪. adjustment = min(30, 20) = 20₪. Budget: 20₪.
- B: wants 50% of remaining. remaining = 20 - 20 = 0₪. SKIP.
- C: remaining = 0₪. SKIP.

Result: Only A applies (capped at item price). Discount = 20₪. Cart = 0₪. Never negative. ✓

**Example E — Non-standard on some items, standard on all (mixed):**

Cart: Item X (50₪), Item Y (30₪), Item Z (40₪) = 120₪
- Bundle: "X+Y for 60₪" → savings = 20₪ (non-standard, claims X and Y)
- Standard: "15% off" on all items

Phase 1: Bundle claims X, Y. Adjustments: X gets -12.5₪, Y gets -7.5₪.
Phase 2: Standard 15% applies per item on remaining:
- Item X: remaining = 50 - 12.5 = 37.5₪. 15% = 5.625₪.
- Item Y: remaining = 30 - 7.5 = 22.5₪. 15% = 3.375₪.
- Item Z: remaining = 40 - 0 = 40₪ (no non-standard). 15% = 6₪.

Result: Bundle saves 20₪ + Standard saves 15₪ = total 35₪. Cart = 85₪. ✓

**Example F — Non-standard promotion where target price > item price (no discount):**

Cart: Item X (10₪)
- Bundle: "1 for 49.9₪" (target_price mode, bundle_size=1)

Phase 1:
1. Compute: originalTotal = 10₪, bundleTotal = 49.9₪, savings = 10 - 49.9 = -39.9₪
2. savings <= 0 → `computeBundle` returns empty adjustments (existing line 72-74)
3. No adjustment applied. Item stays at 10₪.

Result: Promotion skipped — target price is higher than item price. ✓

**Example G — Greedy not optimal, but acceptable:**

Cart: Item A, B, C, D
- Promo X: claims A+B, saves 30₪
- Promo Y: claims B+C, saves 30₪
- Promo Z: claims A+D, saves 30₪

Greedy picks X first (or any — same savings). Claims A, B.
Y needs B → claimed → SKIP.
Z needs A → claimed → SKIP.
Total: 30₪.

Optimal: Y(B,C) + Z(A,D) = 60₪.

Greedy missed the optimal. But in practice, overlapping non-standard promotions targeting different item combinations are rare. The merchant can resolve this by adjusting target_rules. Perfect combinatorial optimization (NP-hard set packing) is not justified for the small numbers involved (< 10 non-standard promos per cart).

**Key design decisions:**
- Non-standard promotions (bundle, buyget_repeat) are mutually exclusive per item because they are target-price operations that conflict when stacked.
- Standard promotions (percentage, fixed) are subtractive and can safely stack on remaining budget, matching Medusa's native behavior.
- The greedy algorithm is sufficient for real-world scenarios (few non-standard promotions per cart, minimal overlap). Optimal combinatorial solving (NP-hard set packing) is not needed.
- Bundle-first, then standard-on-remaining always gives the customer the best or equal deal compared to standard-only (mathematically proven — bundle savings are additive, subsequent percentage/fixed promotions apply to a smaller base but the bundle savings are "free").
- The per-item cap in `applyExtAdjustmentsToCart` is the final safety net — even if the three independent adjustment sources (native, custom, restored) overshoot, the cap clamps total adjustments to the item's subtotal.

---

### Entry 2: Cart Race Condition

**Type:** Bug
**Severity:** Critical — inconsistent cart state visible to customers

**Symptom:** When adding items to cart rapidly (within ~1 second), discount display is inconsistent: partial items get the discount, discount appears multiple times on the same item, or cart total goes negative (e.g., -10.10₪). The POST response returns correct adjustments, but subsequent GET requests or rapid POST sequences show different numbers. A page refresh shows correct data.

**Root cause:** The plugin's promotion logic runs at three invocation points:

| Layer | When | Lock held? |
|---|---|---|
| 1. Workflow hook (`beforeRefreshingPaymentCollection`) | Inside `refreshCartItemsWorkflow` | Yes — distributed workflow lock |
| 2. Route handler (lines 34-35 in `POST /store/carts/:id/line-items/route.ts`) | After workflow completes and releases lock | **No** — only in-memory `applyLock` |
| 3. Subscriber (`cart.updated`) | Async, after cart mutation | **No** — only in-memory `applyLock` |

The race: POST 1's route handler writes adjustments at layer 2 (outside lock). POST 2's workflow runs at layer 1 (inside lock) concurrently. POST 2's `updateCartPromotionsWorkflow(REPLACE)` wipes POST 1's adjustments. POST 2's hook restores them for the new cart state, but POST 1 has already read a stale snapshot and writes it back — overwriting the hook's correct state.

The in-memory `applyLock` (Promise chaining per cart) serializes calls within the plugin's own code, but cannot protect against Medusa's workflow `setLineItemAdjustments` which runs inside the distributed lock on a separate code path.

**Evidence:** Production deployment is single-instance (Medusa Cloud, one container per environment — confirmed via CI workflow analysis and handoff document from deployment topology investigation). The in-memory locks are sufficient for same-process serialization. The vulnerability is the post-workflow gap, not multi-instance interleaving.

**Confirmed behavior:** The bug is transient during rapid adds — a page refresh shows correct data. This is because:
- After all POST handlers complete and the subscriber runs, the last `computeNonStandardAdjustments` writes the correct final state to the DB.
- A page refresh reads the settled DB state, which is correct.
- The wrong data only appears in individual POST responses that were computed during concurrent interleaving.

**Detailed race timeline (two rapid POSTs):**

```
POST 1:
  T1: addToCartWorkflow acquires distributed lock (Medusa Locking Module)
      └─ refreshCartItemsWorkflow runs inside
         └─ updateCartPromotionsWorkflow(REPLACE) — native adjustments
         └─ hook: computeNonStandardAdjustments — restores plugin adjustments ✓
      └─ distributed lock RELEASED
  T2: evaluateAutoApplyPromotions (NO distributed lock)
  T3: computeNonStandardAdjustments (in-memory applyLock only)
      └─ reads cart adjustments ← SNAPSHOT (may become stale)
      └─ writes via setLineItemAdjustments ← WRITE A
  T4: refetchCart → response to frontend

POST 2 (overlaps with T2-T4):
  T5: addToCartWorkflow acquires distributed lock
      └─ updateCartPromotionsWorkflow(REPLACE) ← OVERWRITES "WRITE A"
      └─ hook restores non-standard adjustments ✓
      └─ distributed lock RELEASED
  T6: evaluateAutoApplyPromotions
  T7: computeNonStandardAdjustments → WRITE B (correct, sees both items)
  T8: refetchCart → response

The problem: T5 runs while T3 is running. They use DIFFERENT locks
(T5 = distributed, T3 = in-memory). T3's stale write can overwrite
T5's correct hook output. POST 1's response at T4 may contain wrong data.
```

**Three fix options considered:**

| Option | Description | Pros | Cons |
|---|---|---|---|
| 1. Re-acquire distributed lock | Route handler acquires Medusa's distributed lock again after workflow, wrapping lines 34-35 | Minimal code change (~10 lines) | Two lock acquisitions per request; architecture stays messy with logic split between hook and route |
| 2. Move everything into hook | Rewrite evaluateAutoApplyPromotions to use direct link manipulation; all logic runs in hook inside lock | Clean architecture; one lock; no race by design; route becomes trivial | Bigger refactor; must rewrite auto-apply to bypass workflow |
| 3. Frontend debounce | Queue add-to-cart sequentially on storefront | Eliminates rapid-fire scenario | Not a backend fix; doesn't protect other mutation paths |

**Decision: Option 2 chosen.** Rationale: all bugs (1-4, 6) are being fixed together in one update. The Entry 1 fix changes `computeNonStandardAdjustments` heavily. Doing the architectural refactor at the same time (moving it into the hook) avoids having to touch the same code twice. The team prefers investing more effort now for a cleaner, more reliable architecture. With Option 2, frontend debounce (Option 3) is unnecessary — concurrent POSTs are fully serialized by the distributed lock.

**Designed fix — Move all promotion logic into the workflow hook (Option 2):**

Relocate `evaluateAutoApplyPromotions` into the `beforeRefreshingPaymentCollection` hook. Currently this is impossible because `evaluateAutoApplyPromotions` calls `updateCartPromotionsWorkflow` via `.run()` (standalone invocation), which attempts to acquire the cart lock and deadlocks (the parent workflow holds it). See ADR-0007.

The fix: rewrite `evaluateAutoApplyPromotions` to use **direct link manipulation** via the remote link module — the same pattern already used by `restoreEvictedStandardPromos` (ADR-0009, lines 119-125). Instead of calling the workflow to add/remove promo links, directly create/dismiss links. The plugin's own `evaluateAutoApplyPromotions` and `evaluatePromotion` already perform all the validation that `updateCartPromotionsWorkflow` does (status, dates, native rules, ext rules), so bypassing the workflow is safe.

**What the hook does after refactor:**
1. Evaluate auto-apply promotions → add/remove promo links via `remoteLink.create` / `remoteLink.dismiss`
2. Compute non-standard adjustments (Phase 1 greedy + Phase 2 budget cap from Entry 1)
3. Apply adjustments via `setLineItemAdjustments`

All three steps run inside the workflow's distributed lock. No other code path can interleave.

After this refactor:
- The hook handles everything: auto-apply evaluation (via direct links) + non-standard adjustment computation
- The route handler becomes trivial: `addToCartWorkflow` + `refetchCart`
- The subscriber remains as a fallback for uncovered mutation paths only (e.g., shipping method changes, admin operations)
- ALL promotion logic runs inside the workflow's distributed lock — no concurrent writers, no interleaving, no race

**Impact on related bugs:**
- The `beforeRefreshingPaymentCollection` hook already runs after `updateCartPromotionsWorkflow(REPLACE)` inside `refreshCartItemsWorkflow` (confirmed: line 166 does REPLACE, line 183 fires the hook). So the hook's adjustments are the final word before the lock releases.
- `refetchCart` in the route reads the settled DB state after the workflow completes.

---

### Entry 3: Phantom Promotion Links (restoreEvictedStandardPromos)

**Type:** Bug
**Severity:** Medium — promotions linked without adjustments, confusing storefront display

**Symptom:** After adding an item to a new cart, 15 promotions get linked to the cart even though only 1 has a valid adjustment for the item. The other 14 appear in `cart.promotions` with no adjustments. Example: Campari (2₪) gets only the 25% alcohol discount adjustment, but 14 other promotions (tequila discounts, fixed-price deals for other products) are also linked.

**Root cause:** `restoreEvictedStandardPromos` (in `src/lib/restore-evicted-standard-promos.ts`) links promos **before** checking whether they produce adjustments. The function was designed to restore standard promotions evicted by budget contamination (ADR-0009), but it does not distinguish between:
- "evicted by budget contamination" — promo DID match target_rules but got squeezed out by the shared budget map
- "correctly excluded" — promo's target_rules don't match the cart's items at all

The function at lines 93-115 checks ext rules (activation rules — is active, date range, etc.) but does NOT check Medusa's native target_rules (which products get the discount). At lines 119-125, it creates links via `remoteLink.create` for all promos that pass ext rules. Only AFTER linking does it call `computeActions` at line 184 to compute adjustments. Promos that produce no adjustments remain linked — the links are never cleaned up.

**How this was discovered:** In the Bug 3 investigation, a fresh cart with 1 Campari item (2₪) had 15 promotions linked but only 1 adjustment. Tracing through the code:
1. `evaluateAutoApplyPromotions` added 15 promos that passed ext rules → `updateCartPromotionsWorkflow(ADD)` ran → inside, `computeActions` found only 1 promo that matched the Campari item's target_rules → `updateCartPromotionsStep(REPLACE)` cleaned up to 1 linked promo. Correct so far.
2. Then `computeNonStandardAdjustments` ran → called `restoreEvictedStandardPromos` → this saw 14 standard auto-apply promos that passed ext rules but were NOT linked → treated them as "evicted by budget contamination" → re-linked all 14 via `remoteLink.create` (line 120) → then called `computeActions` (line 184) → only 0 of those 14 produced adjustments (target_rules didn't match Campari) → but the links from line 120 were already created and never cleaned up.

This also caused the false Bug 5 report — a reporter saw promos linked with `discount_total=0` and concluded standard auto-apply was broken. The real issue was these promos shouldn't have been linked at all.

**Designed fix:** Reorder the logic — compute adjustments FIRST, then only link promos that actually produced adjustments:

1. Call `promotionService.computeActions(evictedCodes, cleanContext)` (current line 184) **before** `remoteLink.create` (current line 120).
2. Filter `evictedPromos` to only those whose codes appear in the returned `ADD_ITEM_ADJUSTMENT` actions.
3. Only create links for promos that produced adjustments.
4. Return the adjustments as before.

This ensures promos whose target_rules don't match the cart's items never get linked. Promos that genuinely were evicted by budget contamination (their items DO match but budget was consumed) will produce adjustments in the clean-context computation and will be correctly restored.

---

### Entry 4: Duplicate Adjustment ID Error

**Type:** Bug (sub-case of Entry 2)
**Severity:** Medium — API returns error but cart state is correct on retry

**Symptom:** When adding an item to a fresh cart, the POST response returns:
```json
{"type": "invalid_data", "message": "Cart line item adjustment with id: caliadj_..., already exists."}
```
A subsequent GET for the same cart returns the correct cart with the item and adjustments.

**Root cause:** This is a manifestation of the Entry 2 race condition. The `preservedAdjustments` array in `applyExtAdjustmentsToCart` carries the original adjustment ID (`id: adj.id`). When two concurrent code paths (the workflow's `createLineItemAdjustmentsStep` inside the lock, and the route's `computeNonStandardAdjustments` outside the lock) both try to write the same adjustment ID, the second write fails with a duplicate key error.

**Fix:** Already covered by Entry 2's fix. Moving all promotion logic into the workflow hook eliminates concurrent writers. No separate fix needed.

---

### Entry 5: Standard Auto-Apply Promotions Don't Produce Discounts

**Type:** False report (misdiagnosis of Entry 3)

**Reported symptom:** Standard promotions (percentage/fixed) with `auto_apply=true` get linked to the cart but produce `discount_total=0`. The reporter concluded that Medusa's `computeActions` doesn't compute adjustments because `is_automatic=false`.

**Actual finding:** Standard auto-apply promotions work correctly. The Entry 3 Bug 3 cart data proves it: promo #91 "25% הנחה מגוון אלכוהול" (`promotion_mode: standard`, `auto_apply: true`, `is_automatic: false`) produced a 0.5₪ adjustment on the 2₪ Campari item. `is_automatic` is irrelevant because the plugin explicitly passes promo codes to `updateCartPromotionsWorkflow(ADD)`, and the workflow's `computeActions` evaluates all passed codes regardless of the `is_automatic` flag.

The reporter observed promos linked with `discount_total=0` and concluded computation was broken. The real cause was Entry 3 — `restoreEvictedStandardPromos` re-links promos whose target_rules don't match the cart's items. Those promos produce no adjustments because the items don't match, not because of `is_automatic=false`.

**Fix:** No separate fix needed. Entry 3's fix resolves the confusing symptom.

---

### Entry 6: Bundle Adjustments Duplicated / Cart Goes Negative During Rapid Adds

**Type:** Bug (combination of Entry 1 + Entry 2)

**Symptom:** When adding 2 products from a "2 for 89.9₪" bundle quickly, the storefront shows 110.10₪ discount on a 100₪ cart (total = -10.10₪). Screenshot shows the first item with 3 copies of the same bundle adjustment tag, the second item with 1 copy.

**Root cause:** The bundle adjustment is computed and written multiple times from concurrent execution paths (Entry 2 race condition), and stacks with itself because there is no exclusivity check (Entry 1 stacking).

**Fix:** Already covered by Entry 1 (non-standard exclusive — only one bundle per item) + Entry 2 (move logic into hook — no concurrent writers). No separate fix needed.

---

### Entry 7: Target Price Per Item (Feature Request)

**Type:** Feature request
**Severity:** High — 19 promotions migrated from WooCommerce cannot be represented

**Requirement:** A promotion that sets a target price per individual item. Example: "Target price 49.9₪" — a 60₪ item gets 10.1₪ discount, a 72₪ item gets 22.1₪ discount. Each item gets a different discount based on the difference between its original price and the target price.

**Original request:** Add a new `promotion_mode: "target_price"` to `PromotionExtConfig` with a new calculator function.

**Designed solution:** No new mode needed. The existing `computeBundle` in `adjustment-calculator.ts` with `bundle_size = 1` produces identical results. The math: `completeBundles = floor(totalQty / 1) = totalQty`, so each item becomes its own "bundle" and gets an adjustment of `unit_price - target_price`.

The only change: the Zod validation in `src/api/admin/promotion-ext-configs/validators.ts` line 25 enforces `bundle_size: z.number().int().min(2)`. Change `.min(2)` to `.min(1)`.

**Verification:** With bundle_size=1 and value=49.9:
- 4 eligible items at 60₪, 72₪, 55₪, 130₪
- completeBundles = 4, bundleTotal = 4 × 49.9 = 199.6₪
- originalTotal = 317₪, totalSavings = 117.4₪
- Each item's adjustment brings it to exactly 49.9₪ ✓

**UI concern (deferred):** "Bundle" with size 1 is semantically confusing for merchants — a bundle implies multiple items. Recommended future fix: add a UI preset in the admin that shows "Target Price (per item)" label while using `promotion_mode: "bundle"` with `bundle_size: 1` under the hood. This is a presentation-layer change that does not affect the backend.

**Affected promotions (19):**
- #27, #31, #32, #33, #35, #36, #37 — "X₪ limited to N items"
- #38, #39, #40, #41, #42, #44, #49, #50, #51, #52, #54 — "Target price X₪ on purchases over 299₪"
- #45 — "Carlsberg six-pack June"

---

### Entry 8: Standard Auto-Apply Promos Get No Adjustments on First Link (Regression from Entry 2)

**Type:** Bug (regression introduced by Entry 2 refactor)
**Severity:** Medium — standard auto-apply promotions linked with `discount_total=0` on first cart mutation

**Symptom:** When adding an item to a fresh cart, standard auto-apply promotions get linked to the cart but produce no adjustments (`discount_total=0`, `adjustments=[]`). The promotion appears in `cart.promotions` correctly, but the discount is missing. On the next cart mutation (add another item, change quantity), the discount appears correctly. A page refresh after the second mutation shows the correct total.

Example: "10off" (standard, auto_apply=ON, fixed 10€ off, targets "Medusa Sweatpants") gets linked when adding Sweatpants to an empty cart. The POST response shows `discount_total: 0`. Adding a second item triggers `updateCartPromotionsWorkflow(REPLACE)` which now sees the linked promo and computes the 10€ adjustment.

**Root cause:** The Entry 2 refactor moved `evaluateAutoApplyPromotions` into the `beforeRefreshingPaymentCollection` hook, which fires AFTER `updateCartPromotionsWorkflow(REPLACE)` has already computed native adjustments. The timing:

1. `updateCartPromotionsWorkflow(REPLACE)` runs — computes native adjustments for **currently linked** promos. On a fresh cart, no promos are linked → nothing computed.
2. Hook fires → `evaluateAutoApplyPromotions` finds eligible promos, links them via `remoteLink.create`.
3. Hook continues → `computeNonStandardAdjustments` runs. For non-standard promos (bundle, buyget_repeat), adjustments are computed directly. But for standard promos, adjustments come from Medusa's native `computeActions` — which already ran in step 1 when the promo wasn't linked yet.
4. `restoreEvictedStandardPromos` skips the freshly-linked promos because they ARE linked (`if (linkedPromoIds.has(promotion.id)) continue`) — the function was designed to restore promos that are NOT linked.

Before Entry 2, `evaluateAutoApplyPromotions` called `updateCartPromotionsWorkflow(ADD)` which triggered `computeActions` for all linked promos including newly-added ones. The switch to direct `remoteLink.create` eliminated that computation step.

**Why this wasn't caught earlier:** The bug self-heals on the next cart mutation. Step 1 of the next `refreshCartItemsWorkflow` sees the promo already linked and computes its adjustments. The `cart.updated` subscriber also eventually runs, but it had the same gap (addressed in the fix).

**Designed fix:** Thread newly-linked promo codes from `evaluateAutoApplyPromotions` through to `restoreEvictedStandardPromos` so it computes their adjustments via `computeActions`:

1. The hook captures `added` codes from `evaluateAutoApplyPromotions` and passes them as `freshlyLinkedCodes` to `computeNonStandardAdjustments`.
2. `computeNonStandardAdjustments` threads `freshlyLinkedCodes` through to `applyExtAdjustmentsToCart` → `restoreEvictedStandardPromos`. Early returns at both levels are updated to not bail when `freshlyLinkedCodes` is present.
3. `restoreEvictedStandardPromos` accepts an optional `freshlyLinkedCodes: Set<string>`. For promos whose code is in this set: (a) don't skip even though they're linked, (b) compute adjustments via `computeActions` as usual, (c) skip `remoteLink.create` since they're already linked.
4. The same fix is applied to the `cart.updated` subscriber fallback path.

All parameter additions are optional — backward compatible with existing call sites.

---

## User Stories

1. As a customer, I want only the best promotion to apply to each item in my cart, so that my cart total never goes negative from stacked discounts.
2. As a customer, I want to add items to my cart rapidly without seeing inconsistent discount amounts, so that I can trust the displayed totals.
3. As a customer, I want to see only promotions that actually give me a discount on my items, so that I'm not confused by promotions linked to my cart with no effect.
4. As a customer, I want items eligible for a target-price promotion to show the correct discounted price, so that I see the deal I expect (e.g., "49.9₪ on purchases over 299₪").
5. As a merchant, I want non-standard promotions (bundle, buy-get) to be mutually exclusive per item, so that I don't accidentally create overlapping deals that produce impossible discounts.
6. As a merchant, I want standard promotions (percentage, fixed) to stack on top of non-standard promotions up to the item's price, matching Medusa's native behavior, so that customers get the maximum valid discount.
7. As a merchant, I want to create promotions that set a target price per individual item (not just bundles of 2+), so that I can represent WooCommerce promotions like "49.9₪ on purchases over 299₪."
8. As a merchant, I want the API to never return duplicate adjustment errors when customers add items to their cart, so that the storefront doesn't show error states.
9. As a developer, I want all promotion computation to happen inside the workflow's distributed lock, so that concurrent cart mutations cannot interleave and produce inconsistent state.
10. As a developer, I want `restoreEvictedStandardPromos` to only link promotions that produce adjustments, so that phantom promotion links don't accumulate on carts.
11. As a customer, I want standard auto-apply promotions to produce discounts immediately when my first item is added to the cart, not only after a second mutation.

---

## Implementation Decisions

### 1. Two-phase adjustment resolution (Entry 1)

- **Phase 1 (non-standard exclusive):** After computing all non-standard adjustments, apply a greedy algorithm: sort by total group savings DESC, claim items for the highest-saving promotion first, skip subsequent promotions whose items are already claimed.
- **Phase 2 (standard budget-capped):** Introduce an `appliedPromotionsMap` (Map of item_id to total consumed budget) similar to Medusa's native implementation. Process standard promotions sorted by `value` DESC. Each promotion's adjustment is capped at `item.subtotal - alreadyApplied`. This prevents negative totals.
- The budget cap applies at the final merge point in `applyExtAdjustmentsToCart`, before calling `setLineItemAdjustments`.
- Non-standard promotions are "target-price" operations that conflict when stacked (a bundle can set a price HIGHER than what remains after another discount). Standard promotions are always subtractive and can safely layer.

### 2. Move promotion logic into workflow hook (Entry 2)

- Rewrite `evaluateAutoApplyPromotions` to use direct link manipulation (`remoteLink.create` / `remoteLink.dismiss`) instead of calling `updateCartPromotionsWorkflow`. Precedent: `restoreEvictedStandardPromos` (ADR-0009) already uses this pattern.
- The `beforeRefreshingPaymentCollection` hook becomes the single invocation point for: (a) auto-apply evaluation via direct links, (b) non-standard adjustment computation, (c) budget-capped standard adjustment resolution.
- The POST route handler (`src/api/store/carts/[id]/line-items/route.ts`) simplifies to: `addToCartWorkflow` + `refetchCart`. Lines 34-35 (`evaluateAutoApplyPromotions` + `computeNonStandardAdjustments`) are removed.
- The `cart.updated` subscriber remains as a fallback for mutation paths not covered by route overrides (e.g., shipping method changes). It still calls the same logic but only as a safety net.
- `updateCartPromotionsWorkflow` does not emit `cart.updated`, so direct link manipulation in the hook does not re-trigger the subscriber. No loop.

### 3. Fix restoreEvictedStandardPromos ordering (Entry 3)

- Move `promotionService.computeActions(evictedCodes, cleanContext)` BEFORE `remoteLink.create`.
- Filter evicted promos: only link those whose codes appear in `ADD_ITEM_ADJUSTMENT` actions returned by `computeActions`.
- Promos whose target_rules don't match cart items never get linked.

### 4. Allow bundle_size = 1 (Entry 7)

- Change `src/api/admin/promotion-ext-configs/validators.ts` line 25 from `z.number().int().min(2)` to `z.number().int().min(1)`.
- No changes to `computeBundle` in `adjustment-calculator.ts` — the math already handles `bundle_size = 1` correctly.
- No new promotion mode, no new calculator function, no new code path in `computeNonStandardAdjustments`.

### 5. Architectural constraints (from CONTEXT.md and ADRs)

- All plugin-managed promotions must have `is_automatic: false` — the plugin owns auto-apply logic.
- No proxy-wrapping of Medusa services (proxy-wrapper-risks.md).
- `evaluateAutoApplyPromotions` currently cannot run inside workflow hooks due to deadlock on `updateCartPromotionsWorkflow.run()`. The Entry 2 fix eliminates this constraint by replacing the workflow call with direct link manipulation.
- `setLineItemAdjustments` is a full replace (delete all, create all) — not an append. Concurrent calls interleave reads/writes. The Entry 2 fix eliminates concurrency by running inside the workflow lock.

---

## Testing Decisions

### What makes a good test for this update

Tests should verify **external behavior** (correct adjustments on cart, correct promotion links, correct totals) rather than implementation details (which internal function was called, in what order).

### Modules to test

1. **adjustment-calculator.ts** — Unit tests for `computeBundle` with `bundle_size = 1` (Entry 7). Existing test file: `src/lib/__tests__/adjustment-calculator.unit.spec.ts`. Add cases for single-item bundles.

2. **Two-phase resolution logic** (Entry 1) — Unit tests for the greedy algorithm and budget-cap logic. Test scenarios:
   - Two non-standard promos on same items → only the higher-savings one produces adjustments
   - Non-standard + standard on same item → standard stacks on remaining, capped at item subtotal
   - Standard-only items → Medusa-like budget tracking, no negative totals
   - Mixed types where budget runs out → final total never below 0

3. **restoreEvictedStandardPromos** (Entry 3) — Unit test verifying promos that don't produce adjustments are NOT linked. Existing test patterns in `src/lib/__tests__/compute-non-standard-adjustments.unit.spec.ts`.

4. **Integration: hook-based promotion flow** (Entry 2) — Integration test that fires two rapid `addToCartWorkflow` calls on the same cart and verifies consistent final state. This may require a running Medusa instance or a mock of the workflow engine.

5. **Validation** (Entry 7) — Test that `bundle_size: 1` passes validation and `bundle_size: 0` fails.

### Prior art

Existing test files follow the pattern of mocking the Medusa container (`container.resolve`) and testing the pure computation logic. The `adjustment-calculator.unit.spec.ts` tests are good examples — they test `computeBundle` and `computeBuyGetRepeat` with various item configurations and verify the returned adjustment amounts.

## Out of Scope

- **Priority field on PromotionExtConfig** — The two-phase resolution (greedy best-deal) is the default behavior. A future `priority` field could override the greedy selection, but it is not needed for this update.
- **Admin UI changes for "Target Price" label** — The backend supports `bundle_size = 1` now. Renaming the admin UI to show "Target Price" instead of "Bundle" when `bundle_size = 1` is deferred to a future update.
- **Distributed locking (Redis/DB advisory locks)** — Production runs on single-instance Medusa Cloud. Multi-instance protection is not needed now. If deployment topology changes, add distributed locks then.
- **Unsupported WooCommerce features** — Section 3 of PROMOTIONS-DEV-SPEC.md lists features not yet supported: user-logged-in condition, auto-add free product (BXGY with specific product), category-based targeting. These are separate feature requests.
- **Frontend debounce** — Queue rapid add-to-cart sequentially on the storefront. The backend fix (Entry 2) makes this unnecessary for correctness, but it could improve UX. Deferred.

---

## Further Notes

### Execution order recommendation

1. **Entry 3** (restoreEvictedStandardPromos fix) — smallest, most isolated change. Fixes phantom links immediately.
2. **Entry 7** (bundle_size validation) — one-line change, unblocks 19 promotions.
3. **Entry 2** (move logic into hook) — architectural refactor that fixes the race condition, duplicate ID errors (Entry 4), and duplicate adjustments (Entry 6). Should be done before Entry 1 because it changes where the resolution logic runs.
4. **Entry 1** (two-phase resolution) — builds on the Entry 2 refactor. The greedy algorithm and budget cap are implemented in the same code path that Entry 2 consolidates into the hook.
5. **Entry 8** (freshly-linked standard promo adjustments) — fixes a regression introduced by Entry 2. Must be implemented after Entry 2.

### Relationship between entries

| Entry | Type | Depends on | Fixes |
|---|---|---|---|
| 1 | Bug fix | Entry 2 (same code path) | Discount stacking, negative totals |
| 2 | Architectural refactor | None | Race condition, concurrent writers |
| 3 | Bug fix | None | Phantom promotion links |
| 4 | Bug (sub-case of Entry 2) | Entry 2 | Duplicate adjustment ID error |
| 5 | False report | Entry 3 | N/A — not a real bug |
| 6 | Bug (Entry 1 + Entry 2) | Entry 1, Entry 2 | Bundle duplication during rapid adds |
| 7 | Feature request | None | Target price per item (19 promotions) |
| 8 | Bug (regression from Entry 2) | Entry 2 | Standard auto-apply promos get no adjustments on first link |

### Reference files

| File | Relevance |
|---|---|
| `src/lib/compute-non-standard-adjustments.ts` | Core adjustment merge logic — Entry 1, 2, 3 changes |
| `src/lib/adjustment-calculator.ts` | Pure computation — Entry 1 greedy, Entry 7 validation |
| `src/lib/evaluate-auto-apply-promotions.ts` | Auto-apply engine — Entry 2 refactor to direct links |
| `src/lib/restore-evicted-standard-promos.ts` | Entry 3 ordering fix |
| `src/lib/target-rule-evaluator.ts` | Item eligibility filtering — used by Entry 1 resolution |
| `src/api/store/carts/[id]/line-items/route.ts` | Route handler — Entry 2 simplification |
| `src/subscribers/cart-updated.ts` | Subscriber — Entry 2 fallback role |
| `src/subscribers/sync-non-standard-adjustments.ts` | Workflow hook — Entry 2 becomes primary invocation |
| `src/api/admin/promotion-ext-configs/validators.ts` | Entry 7 validation change |
| `docs/metadata-promotion-enforcement/CONTEXT.md` | Domain glossary — update after implementation |
| `docs/metadata-promotion-enforcement/adr/` | ADRs 0004, 0006, 0007, 0009 are directly relevant |
