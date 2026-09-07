---
"@retailos-ai/rms-promotions-extension": minor
---

Add `/admin/order-adjustment-repair/:id` for finding and removing leaked order discount rows.

A promoted order line should carry exactly one `order_line_item_adjustment` row per promotion. Medusa leaves extra rows behind when an order-edit confirm fails: `undoLastChange_`, the rollback handler of the `confirmOrderChanges` step, restores the order version, the order change, the actions, the items, the summary, the shipping methods and the credit lines, but not the adjustments. Its sibling `revertLastChange_` does. Nothing filters the leftovers out on read either, because the `version` column on an adjustment is never used as a read filter, so every orphan keeps counting toward the order total. haturki order #880 accumulated five rows on each of two lines and one line went negative.

`GET` reports each line's rows grouped by promotion, flags the groups holding more than one, and lists the ids that are safe to remove. `POST` takes `adjustment_ids` and soft-deletes exactly those, accepting an id only if `GET` listed it as deletable, so it must belong to that order and must not be a promotion's last remaining row. Paid orders are refused. `dry_run` reports the projected totals without writing, and because the delete is soft, `restoreOrderLineItemAdjustments` undoes it.
