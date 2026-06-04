# ADR-0007: Synchronous Cart Promotion Evaluation via Route Overrides

**Status:** Accepted  
**Date:** 2026-06-03  
**Amends:** ADR-0001 (consequence: "Layer 2 is always async")

---

## Context

ADR-0001 established a three-layer promotion enforcement architecture where Layer 2 (auto-apply evaluation and non-standard adjustment computation) runs as an async `cart.updated` subscriber. The reasoning was that nesting `updateCartPromotionsWorkflow` inside a workflow hook would deadlock due to cart locking.

This caused a user-visible problem: the API response from cart mutations (add/update/delete item, promo code entry) returned stale data. Auto-applied promotions and non-standard adjustments (bundle, buy-get-repeat) only appeared on the next `GET /store/carts/{id}` call, after the subscriber had finished.

---

## Investigation: Can We Use a Workflow Hook?

We attempted to call `evaluateAutoApplyPromotions` (which calls `updateCartPromotionsWorkflow`) from inside `refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection`.

Medusa's `acquireLockStep` has sub-workflow detection:

```js
const isSubWorkflow = !!parentStepIdempotencyKey;
if (isSubWorkflow && !data.executeOnSubWorkflow) {
    return StepResponse.skip();  // Lock skipped for sub-workflows
}
```

However, this only applies to `.runAsStep()` (sub-workflow composition). Hook handlers invoke workflows via `.run()` (standalone invocation), which does NOT set `parentStepIdempotencyKey`. The lock step executes normally and deadlocks because the parent workflow still holds the lock.

**Test result:** `POST /store/carts/{id}/line-items` → 500 "Failed to acquire lock" when `evaluateAutoApplyPromotions` called `updateCartPromotionsWorkflow(container).run()` from inside the hook.

**Conclusion:** ADR-0001 was correct — `updateCartPromotionsWorkflow` cannot be called from inside a workflow hook. The `.runAsStep()` vs `.run()` distinction is critical.

---

## Decision

Use **custom store route overrides** for all storefront cart mutation endpoints. Each route:

1. Runs the original Medusa workflow (acquires and releases the cart lock)
2. **After** the workflow completes (lock released), calls `evaluateAutoApplyPromotions` (safe — lock is free)
3. Calls `computeNonStandardAdjustments` for bundle/buyget adjustments
4. Calls `refetchCart` and returns the response with correct data

Additionally, a **workflow hook** on `refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection` runs `computeNonStandardAdjustments` (not `evaluateAutoApplyPromotions`) inside the workflow for promotions already on the cart. The hook passes `{ insideHook: true }` to prevent `computeNonStandardAdjustments` from calling `updateCartPromotionsWorkflow` — which would deadlock for the same `.run()` vs `.runAsStep()` reason described above.

> **Bug discovered 2026-06-04:** `computeNonStandardAdjustments` has a code path that calls `updateCartPromotionsWorkflow.run()` to remove a non-standard promotion when no cart items are eligible. This was not accounted for when the original ADR stated "calls `setLineItemAdjustments` (a direct module method, not a workflow)." The `insideHook` flag skips that path; promotion removal is deferred to the route override (`evaluateAutoApplyPromotions` for auto-apply) or the `cart.updated` subscriber (Pass 2 for code-applied).

### Routes overridden

| Route | Original workflow | Added after workflow |
|---|---|---|
| `POST /store/carts/:id/line-items` | `addToCartWorkflow` | Auto-apply eval + non-standard adjustments |
| `POST /store/carts/:id/line-items/:line_id` | `updateLineItemInCartWorkflow` | Auto-apply eval + non-standard adjustments |
| `DELETE /store/carts/:id/line-items/:line_id` | `deleteLineItemsWorkflow` | Auto-apply eval + non-standard adjustments |
| `POST /store/carts/:id/promotions` | `updateCartPromotionsWorkflow` | Non-standard adjustments only |
| `DELETE /store/carts/:id/promotions` | `updateCartPromotionsWorkflow` | Non-standard adjustments only |

The promotions routes do not need auto-apply evaluation — they handle explicit promo code entry/removal, not cart state changes.

### Async subscriber (fallback)

The `cart.updated` subscriber remains for mutation paths not covered by route overrides (e.g., shipping method changes, cart transfers, admin operations).

---

## Considered Alternatives

**Alternative A — All logic in workflow hook:**
Move both auto-apply evaluation and adjustment computation into `beforeRefreshingPaymentCollection`. Rejected because `evaluateAutoApplyPromotions` calls `updateCartPromotionsWorkflow.run()` which deadlocks (see investigation above).

**Alternative B — Frontend re-fetch with delay:**
After each cart mutation, the storefront waits ~500ms and re-fetches the cart. Rejected because the delay is a guess — if the subscriber is slow, the re-fetch still returns stale data.

**Alternative C — Server-Sent Events / WebSocket notification:**
The subscriber notifies the frontend when it finishes, triggering a re-fetch. Rejected as over-engineered infrastructure for this problem.

**Alternative D — Keep async-only, accept the gap:**
Rejected because the gap was visible to users and undermined trust in the cart total.

---

## Consequences

- **ADR-0001 amendment:** Layer 2 is no longer purely async. The primary path is synchronous via route overrides + workflow hook. The subscriber is a fallback.
- The API response from add/update/delete item and promo code entry now includes auto-applied promotions and non-standard adjustments — no stale data.
- Cart mutations are slightly slower (~50-200ms) because the route runs promotion evaluation after the workflow.
- Five store routes are overridden. If Medusa changes the route handler signature or workflow inputs in a future version, these overrides need updating.
- The shared functions (`evaluateAutoApplyPromotions`, `computeNonStandardAdjustments`) are used by both routes and subscriber — no logic duplication.
- Layer 3 (checkout gate) remains unchanged as the authoritative safety net.

---

## Lessons Learned

1. **`.runAsStep()` vs `.run()` matters.** Sub-workflow lock skipping only applies to `.runAsStep()`. Hook handlers use `.run()` which is a standalone invocation — the lock is NOT skipped.
2. **Test assumptions in dev before shipping.** The lock-skip analysis was based on reading source code. The deadlock only manifested when tested on a real Medusa instance.
3. **Route overrides are a valid Medusa extension pattern.** They're explicit, easy to understand, and give full control over the response lifecycle. The tradeoff is maintenance when Medusa updates route handlers.
