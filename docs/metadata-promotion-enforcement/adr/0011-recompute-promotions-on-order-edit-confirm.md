# ADR-0011: Recompute Promotions on Order-Edit Confirm

**Status:** Accepted  
**Date:** 2026-09-08  
**Amends:** ADR-0001 (decision: "a three-layer pattern" — this adds a fourth, and the fourth mutates)

---

## Context

Layers 1 to 3 of the Promotion Enforcement Layer all operate on a **cart**. Once a cart becomes an order, nothing recomputes a promotion again. Confirming an order edit carries the adjustment amount forward untouched, so raising a line's quantity keeps the discount at whatever it was when the order was placed.

Measured on migrationtest order #107 (issue #117): a `10off` percentage promotion on a line at 8 ILS, placed at quantity 3 with a 2.40 adjustment. Six edit confirms took the line to quantity 7. The order total moved every time, 21.60 → 53.60, and the discount stayed at 2.40 throughout, where 10% of the quantity-7 line is 5.60. The customer is over-charged by the gap, which grows with every edit. haturki #880 showed the same staleness on a fixed-price promotion.

This fires on **every** order edit of a promoted order. There is no precondition, unlike the duplicated-rows bug (retailOs-customers/medusa-backend#935), which needs a confirm to fail.

Medusa 2.19 ships the machinery to fix it. `computeAdjustmentsForPreviewWorkflow` runs inside every order-edit mutation workflow, recomputes every promotion against the previewed order, and writes the result as `ITEM_ADJUSTMENTS_REPLACE` order change actions. It is gated on `order.promotions.length && orderChange.carry_over_promotions`, and `beginOrderEditOrderWorkflow` never sets that flag — the column is nullable and only the exchange flow ever writes it. So the branch never runs on an order edit and the previous amount is carried forward.

Three seams were available and two were rejected:

- **A hook on the confirm workflow.** `confirmOrderEditRequestWorkflow` exposes none. `beginOrderEditOrderWorkflow` exposes none either.
- **Recomputing the amounts ourselves.** Would mean reimplementing percentage and fixed pricing across `each` and `across` allocation, plus the item-targeting context (products, collections, categories, tags, and the plugin's brand and manufacturer conditions). A promotion whose context we failed to build would compute to nothing and drop the whole discount, which is worse than a stale amount.
- **Setting the flag and letting Medusa's engine do the arithmetic.** Chosen.

---

## Decision

`recalcOrderEditPromotions` (`src/lib/recalc-order-edit-promotions.ts`) runs as a middleware on `POST /admin/order-edits/:id/confirm`, before the core handler. It:

1. Reads the order, its promotions, and the active order change.
2. Skips unless there is an active change and at least one standard-mode promotion.
3. Writes `carry_over_promotions: true` on the order change.
4. Runs `computeAdjustmentsForPreviewWorkflow`, which recomputes and writes `ITEM_ADJUSTMENTS_REPLACE` actions against the current preview.
5. Adds a second set of merged `ITEM_ADJUSTMENTS_REPLACE` actions for the lines where the engine's list is not the whole story.

The confirm then applies the actions as it always has. Amounts are Medusa's, so `percentage` and `fixed`, `each` and `across` all behave the way they do on a cart.

### The flag has to be persisted, not just passed

`computeAdjustmentsForPreviewWorkflow` has a second `when` branch that **deletes** every `ITEM_ADJUSTMENTS_REPLACE` action on the change when the flag reads falsy — and it reads it off the previewed order, from the database. Passing `carry_over_promotions: true` as workflow input alone would have the first branch create the actions and the second delete them in the same run.

### Why a middleware and not a route override

A plugin route file shadows the core route of the same path, so `POST /admin/order-edits/:id/confirm` could have been overridden outright. The core handler is four lines today and may not stay that way; a middleware runs after the admin auth and policy checks, before the handler, and keeps Medusa's handler as the only thing that confirms an edit.

### Why the merge pass exists

An `ITEM_ADJUSTMENTS_REPLACE` action replaces a line's **whole** adjustment list, and the engine only produces rows for the order's own promotions. Two kinds of row would be deleted by that:

- **Operator-created adjustments.** A manual `CartExtAdjustment` becomes an order line item adjustment with no `promotion_id` when the cart completes. Nothing recomputes it, so the engine's action would silently drop it.
- **Bundle and buy-get rows.** ADR-0004 pins `application_method.value` at 1 for non-standard modes, so native `computeActions` prices a bundle promotion at 1 unit of currency. The engine's figure for those promotions is meaningless.

So `mergePreservedItemAdjustments` replaces a row **only when the engine actually priced its promotion on that line**. Everything else is carried over from the order as it stands. Where the merged list differs from what the engine wrote, a second action is added — the highest `ordering` wins during change processing, so it supersedes the engine's. Where it does not differ, no action is added and the engine's own action stands.

### A promotion the engine says nothing about keeps its row

Probing a real order caught the case that made this rule necessary. `computeActions` only ever looks at promotions with status `active` (`listActivePromotions_`), so a promotion that was deactivated or expired after the order was placed comes back with no computed row at all — and so does one whose rule context could not be built, the risk that ruled out computing the amounts ourselves.

Treating "no computed row" as "no discount" zeroed the whole discount on the confirmed order. That is the same harm as the bug being fixed, pointing the other way: the customer had already been given that discount, and an edit to a quantity would silently take it back. So an unpriced promotion keeps the amount it has, which is exactly today's behaviour and therefore a safe failure.

The cost is that a promotion which legitimately stopped qualifying after the edit also keeps its row. There is no way to tell that apart from an inactive promotion by looking at the actions, and of the two mistakes, over-charging the customer is the worse one.

An order whose promotions are **all** in a non-standard mode is skipped at step 2. There is nothing for the engine to price there, and running it would replace stale amounts with wrong ones.

### Failure is loud

If the recomputation throws, the middleware does not swallow it: the request fails and the edit is not confirmed. A failed confirm moves no money and the operator sees it. A confirm that quietly records the wrong discount is the bug being closed here.

---

## Consequences

- Confirming an order edit on a promoted order now recomputes the discount for every standard-mode promotion on it, against the edited quantities.
- The recomputation collapses duplicate adjustment rows **for standard-mode promotions only**, as a side effect of one action replacing the line's whole list. Preserved rows are copied verbatim, so duplicates among those survive the edit, and no order is repaired unless it is being edited. `GET /admin/order-adjustment-repair/:id` remains the tool for both cases.
- A promotion that no longer qualifies after the edit keeps its adjustment rather than losing it, because an inactive promotion and a no-longer-qualifying one are indistinguishable at this seam. See "A promotion the engine says nothing about keeps its row".
- Shipping method adjustments are recomputed too, since the same workflow writes `SHIPPING_ADJUSTMENTS_REPLACE` actions. The plugin writes no shipping adjustments, so there is nothing to preserve there.
- Bundle and buy-get amounts still do not follow an order edit. They are carried over as they are today. Closing that needs the plugin's own calculator run against a previewed order, which is a larger piece of work.
- The previews an operator sees **while** editing are still stale until the first mutation after the flag is set. The flag is written at confirm time, and Medusa recomputes on mutations only when it is already set, so the corrected figure appears in the confirm response rather than in the intermediate previews.
- Only an **edit**'s order change is touched. The query filters on `change_type: "edit"`, which is stricter than the core confirm workflow — that one matches on status alone and will confirm whatever active change it finds. The extra filter is deliberate: on an exchange or a claim, `carry_over_promotions` is a toggle the operator sets, and forcing it true would override them.
- The write path runs under Medusa's own order lock, on the `order_id` key with the same 2-second timeout the order-edit workflows use, and releases before the confirm handler takes it. Without that it would race the mutation workflows, which write replace actions of their own — the concurrent-writer class BF-016 documents.
- A confirm that fails and is retried adds another set of replace actions rather than replacing the previous set. The highest `ordering` still wins, so the amounts stay right, but `order_change.actions` grows with each attempt and that list is carried in the emitted confirm event. Medusa's own machinery appends the same way on every mutation.
- **Known gap — no per-line cap over the merged list.** The engine computed its rows against a budget in which a non-standard promotion was worth `application_method.value`, i.e. 1. Swapping in the promotion's real amount can therefore push a line's total discount past its subtotal, on a line carrying both a near-total bundle discount and a standard promotion. The cart path has `capAdjustmentsToSubtotal` for exactly this; the order path has nothing equivalent yet, and adding one raises a tax-basis question (adjustment amounts on a tax-inclusive order against a previewed `subtotal` that excludes tax) that this change does not answer.
- `ORDER_FIELDS` in the module is a copy of `fieldsToComputeAdjustmentsForPreview` from `@medusajs/core-flows`, which is not exported. If Medusa adds a field the compute context needs, this copy must follow.
- If Medusa ever defaults `carry_over_promotions` to true for order edits, steps 3 and 4 become redundant and only the merge pass is still needed.
