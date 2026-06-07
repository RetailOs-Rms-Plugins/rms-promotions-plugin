# ADR-0006: Serialize Concurrent Promotion Paths with In-Memory Lock

**Status:** Accepted (amended 2026-06-07)  
**Date:** 2026-06-03  
**Relates to:** ADR-0005 (re-apply after wipe strategy), ADR-0007 (sync route overrides)

---

## Context

ADR-0002 established three invocation points for `computeNonStandardAdjustments`:

1. **Workflow hook** — `refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection` (synchronous, inside the workflow)
2. **Route overrides** — custom store routes for add/update/delete line-items and promotions (synchronous, after workflow completes)
3. **Async subscriber** — `cart.updated` subscriber as a fallback for mutation paths not covered by route overrides

All three call `applyExtAdjustmentsToCart`, which reads the cart's current line item adjustments, filters out native adjustments for custom-mode promotions, merges in the plugin's computed adjustments, and writes the result back via `cartModule.setLineItemAdjustments`.

### The bug

When a storefront adds an item to a cart with an active bundle promotion, the response contained **duplicate adjustments** (e.g., 2×5 instead of 1×5). The discount was doubled.

### Root cause

`setLineItemAdjustments` is not concurrency-safe. Its implementation:

```
1. List all existing adjustments for the cart
2. Soft-delete those not in the new list
3. Upsert the new list
```

When the route handler and the async `cart.updated` subscriber call `setLineItemAdjustments` concurrently for the same cart:

```
Call A (route):     reads existing → [adj_old]
Call B (subscriber): reads existing → [adj_old]     ← same snapshot
Call A: soft-deletes adj_old, creates adj_X
Call B: soft-deletes adj_old (no-op), creates adj_Y
Result: adj_X + adj_Y → 2 adjustments instead of 1
```

Both calls intend to write exactly 1 adjustment, but interleaving produces 2.

---

## Options

### Option A — Database-level unique constraint

Add a partial unique index on `cart_ext_adjustment (cart_id, promotion_id, item_id) WHERE deleted_at IS NULL`.

**Rejected because:**
- Medusa's `MedusaService.deleteCartExtAdjustments` uses soft delete. A standard unique constraint would clash with soft-deleted rows. A partial index (`WHERE deleted_at IS NULL`) works in PostgreSQL but adds migration complexity.
- The duplicate adjustments appear on Medusa's native `line_item_adjustment` table (managed by `setLineItemAdjustments`), not on our `cart_ext_adjustment` table. A constraint on our table doesn't prevent the interleaving in Medusa's table.

### Option B — Skip subscriber when route already handled it

Detect that a route override already called `computeNonStandardAdjustments` and skip it in the subscriber.

**Rejected because:**
- No reliable way to tag a `cart.updated` event with its source (route vs. other mutation path).
- The subscriber is still needed for mutation paths not covered by route overrides (e.g., shipping method changes, customer assignment).

### Option C — In-memory per-cart lock + ext adjustment dedup

Serialize `applyExtAdjustmentsToCart` calls per cart using a promise-based lock. Additionally, deduplicate ext adjustment rows by `(promotion_id, item_id)` before building the adjustment list.

**Chosen because:**
- The lock prevents the interleaving that causes duplicates in `setLineItemAdjustments`. The second call waits for the first to finish, reads the updated state, and writes correctly.
- The dedup is a defensive layer: if duplicate ext rows exist in the `cart_ext_adjustment` table (from concurrent `computeNonStandardAdjustments` create calls), they collapse to 1 before being applied.
- No migration required. No Medusa internals modified.
- Manual adjustments (`promotion_id: null`) are unaffected by the dedup — they pass through untouched.

---

## Decision

1. **Per-cart in-memory lock** — A `Map<string, Promise<void>>` chains `applyExtAdjustmentsToCart` calls for the same cart ID. Concurrent calls queue instead of interleaving.

2. **Ext adjustment dedup** — Before building the custom adjustment list, ext rows with the same `(promotion_id, item_id)` are collapsed to one. Rows with `promotion_id: null` (manual adjustments) are never deduped.

Both mechanisms are in `src/lib/compute-non-standard-adjustments.ts`.

---

## Consequences

- **Single-process only.** The in-memory lock serializes calls within one Node.js process. In a multi-process or multi-instance deployment, concurrent calls from different processes can still interleave. The dedup mitigates this for ext rows, but `setLineItemAdjustments` on Medusa's table remains vulnerable. For multi-instance deployments, a distributed lock (e.g., Redis) or Medusa-level fix would be needed.
- **Minimal latency impact.** The lock only serializes the final merge+write step (`applyExtAdjustmentsToCart`), not the full computation. The second call waits ~10-30ms for the first to complete.
- **Lock cleanup.** The lock map entry is removed once the chain settles, preventing memory leaks for long-running processes with many distinct carts.

---

## Amendment: Auto-Apply Race Condition (2026-06-07)

### The bug

Standard promotions with `auto_apply: true` in the ext config (but `is_automatic: false` in Medusa native) produce **duplicate native adjustments** — two identical `caliadj_*` rows on the same line item from the same promotion.

Example: a 10% promotion with "Cart Subtotal >= 300" condition. Cart total 390, expected discount 33.05, actual discount 66.10 (2 × 33.05).

### Root cause

Same class as the original bug, but on a different code path. ADR-0007 established a dual-call pattern for `evaluateAutoApplyPromotions`:

1. **Route handler** (`src/api/store/carts/[id]/line-items/route.ts`) — calls `evaluateAutoApplyPromotions` synchronously after `addToCartWorkflow` completes, so the API response includes auto-applied promotions immediately.
2. **Subscriber** (`src/subscribers/cart-updated.ts`) — calls `evaluateAutoApplyPromotions` asynchronously as a fallback for mutation paths not covered by route overrides.

Both callers independently query `cart.promotions`, determine the promo should be added, and call `updateCartPromotionsWorkflow(ADD, code)`. Medusa's workflow uses a cart lock, but the promo-eligibility check happens **outside** the lock. Timeline:

```
Route handler:  query cart.promotions → not applied → call workflow(ADD)
Subscriber:     query cart.promotions → not applied → call workflow(ADD)  ← races
```

Medusa's `updateCartPromotionsWorkflow` serializes via cart lock, but the second run's `computeActions` may not see the first run's adjustment (transaction visibility gap). Since `createLineItemAdjustmentsStep` uses `addLineItemAdjustments` (append, not replace), the second run appends a duplicate.

This differs from the original bug: the original affected `applyExtAdjustmentsToCart` (plugin's `setLineItemAdjustments` for non-standard promos). This one affects Medusa's native `addLineItemAdjustments` for standard promos applied via auto-apply.

### Decision

Extend the per-cart in-memory lock pattern to `evaluateAutoApplyPromotions`. The lock wraps the entire function — eligibility check through workflow call — so the second caller re-queries `cart.promotions` after the first finishes, sees the promo is already linked, and short-circuits.

Implementation in `src/lib/evaluate-auto-apply-promotions.ts`.

### Lock ordering constraint

The lock nesting is:

```
Lock A: evaluateAutoApplyPromotions per-cart lock (in-memory)
  └─ Lock B: updateCartPromotionsWorkflow cart lock (Medusa workflow engine)
```

This is safe because Lock A is always acquired **outside** workflow execution. `evaluateAutoApplyPromotions` must **never** be called from inside a workflow hook (where Lock B is already held), or it will deadlock. This constraint was already documented in the function's JSDoc and in ADR-0002.

### Consequences (additional)

- **Same single-process limitation** as the original lock. Multi-instance deployments remain vulnerable.
- **Higher latency impact** than the original lock. The original lock serializes only `applyExtAdjustmentsToCart` (~10-30ms). This lock serializes the full auto-apply evaluation including DB queries and rule evaluation (~100-500ms). The subscriber is async, so this does not affect API response times.
- **No new dependencies.** Uses the same `Map<string, Promise<void>>` pattern.
