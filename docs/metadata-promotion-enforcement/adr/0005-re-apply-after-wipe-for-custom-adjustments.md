# ADR-0005: Re-Apply After Wipe Strategy for Custom Cart Adjustments

**Status:** Accepted  
**Date:** 2026-05-21

---

## Context

The plugin needs to write custom adjustments to carts — both operator-created manual adjustments and engine-computed bundle/buy-get adjustments. Medusa's `updateCartPromotionsWorkflow` calls `setLineItemAdjustments` on every cart mutation, which **replaces all** existing line item adjustments with the promotion engine's output. Any custom adjustments written by the plugin are wiped.

The plugin needs a strategy to ensure its adjustments persist across cart mutations.

---

## Options

### Option A — Hook into the promotion workflow (inject before write)

Use a workflow hook to inject custom adjustments into the list before `setLineItemAdjustments` is called, making them part of the atomic write.

**Rejected because:**
- `updateCartPromotionsWorkflow` only exposes a `validate` hook, which fires **before** any operations and is designed for throwing errors to block the workflow.
- No hook exists between `computeActions` and `setLineItemAdjustments`. There is no way to inject additional adjustments into the set.

### Option B — Re-apply after wipe

Store adjustment intents in a plugin-owned table (`cart_ext_adjustment`). On every `cart.updated` event, after Medusa's promotion workflow completes, the subscriber reads the table and calls `addLineItemAdjustments` to re-create the custom adjustments.

**Chosen because:**
- Uses the same extension point (subscriber) and async pattern already established by Layer 2.
- No Medusa internals touched — purely additive via `addLineItemAdjustments`.
- The plugin-owned table is the single source of truth; Medusa's `caliadj_*` records are a downstream effect.

### Option C — Override cart retrieval to merge adjustments at read time

Store adjustments in a plugin table and merge them into the cart response, never writing to Medusa's adjustment system.

**Rejected because:**
- Cart `total`, `discount_total`, and other computed fields would not reflect the custom adjustments — Medusa calculates these from its own adjustment records.
- Overriding cart total calculation requires deep Medusa internals modification, which is fragile and unsupported.

---

## Decision

Custom adjustments are stored in the `cart_ext_adjustment` table (plugin-owned). The `cart.updated` subscriber re-applies them after every Medusa promotion recalculation cycle. The flow within the subscriber is sequential:

1. Layer 2 promotion delta (existing)
2. Compute bundle/buy-get adjustments for applied promotions with non-standard `promotion_mode`
3. Read manual adjustment intents for this cart
4. Compute cart-wide spread for manual adjustments with `item_id: null`
5. Combine all custom adjustments into a single `addLineItemAdjustments` call

---

## Consequences

- **Same async window.** Custom adjustments are absent from the cart between the mutation response and the subscriber execution. This is the same window already accepted for Layer 2 (promotion delta). Layer 3 (checkout gate) validates that all expected adjustments are present before allowing order placement.
- **Single subscriber handles everything.** The existing `cart.updated` subscriber is extended rather than adding a separate subscriber. This guarantees execution order: promotions first, custom adjustments second.
- **CRUD endpoints apply immediately.** When an operator creates, updates, or deletes a manual adjustment via the admin API, the endpoint applies the change to Medusa's cart adjustments directly — it does not wait for the next `cart.updated` cycle. The subscriber handles re-application on subsequent cart mutations.
