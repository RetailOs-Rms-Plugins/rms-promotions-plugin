# ADR-0006: Serialize applyExtAdjustmentsToCart with In-Memory Lock

**Status:** Accepted  
**Date:** 2026-06-03  
**Relates to:** ADR-0005 (re-apply after wipe strategy)

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
