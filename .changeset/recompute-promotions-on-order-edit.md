---
"@retailos-ai/rms-promotions-extension": minor
---

Recompute a promoted order's discount when an order edit is confirmed.

An order edit never recomputed the promotion. The adjustment amount stayed at whatever it was when the order was placed, so raising a line's quantity under-charged the discount and over-charged the customer by a margin that grew with every edit. Measured on migrationtest order #107: six confirms took a line at 8 ILS from quantity 3 to quantity 7, the order total moved 21.60 to 53.60 every time, and the discount stayed at 2.40 where 10% of the quantity-7 line is 5.60. This fired on every order edit of a promoted order, with no precondition.

All three enforcement layers operate on a cart, so once a cart was an order nothing recomputed. Medusa's own `computeAdjustmentsForPreviewWorkflow` would have — it runs inside every order-edit mutation workflow — but it is gated on `carry_over_promotions` on the order change, and `beginOrderEditOrderWorkflow` never sets that flag. Only the exchange flow writes it.

`recalcOrderEditPromotions` now runs as a middleware on `POST /admin/order-edits/:id/confirm`. Under the order's own lock it persists the flag, runs that workflow so Medusa's engine prices the previewed order, then adds a merged set of `ITEM_ADJUSTMENTS_REPLACE` actions for the lines where the engine's list is not the whole story. Only an edit's order change is touched — on an exchange or a claim the flag is a toggle the operator sets, and forcing it true would override them. Amounts come from Medusa, so `percentage` and `fixed`, `each` and `across` behave the way they do on a cart. One row per standard-mode promotion per line, because a replace action replaces the line's list rather than appending to it. Preserved rows are copied verbatim, duplicates included, so the repair route stays the tool for those.

The merge pass is there because that replacement takes the line's **whole** list with it, and the engine only produces rows for the order's promotions. Operator-created adjustments carry no `promotion_id` and would have been deleted by confirming an edit. Bundle and buy-get rows are priced off `application_method.value`, which ADR-0004 pins at 1, so the engine's figure for them is meaningless. Both are carried over from the order as they stand. An order whose promotions are all in a non-standard mode is skipped outright.

A row is only replaced when Medusa's engine actually priced its promotion on that line. `computeActions` sees `active` promotions only, so one deactivated after the order was placed returns nothing — and reading that as "no discount" zeroed the discount on the confirmed order, which is the same harm as the original bug in the other direction. An unpriced promotion keeps its amount instead. The trade-off is that a promotion which genuinely stopped qualifying also keeps its row; the two are indistinguishable here, and over-charging the customer is the worse mistake.

Bundle and buy-get amounts therefore still do not follow an order edit; they are preserved, not recomputed, and `/admin/order-edits/:id/custom-items` remains the operator's workaround for that. A promotion that stops qualifying after an edit now loses its adjustment, which is the point of recomputing but is a visible change for anyone who lowers a line below a promotion's threshold. If the recomputation fails the confirm fails with it: a refused edit moves no money, a confirmed one with the wrong discount does.

ADR-0011 and BF-017 record the decision and the measurement.
