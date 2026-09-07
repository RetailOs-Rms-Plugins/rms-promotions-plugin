import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  planOrderAdjustmentRepair,
  OrderLineWithAdjustments,
} from "../../../../lib/plan-order-adjustment-repair"

interface AdminRepairOrderAdjustmentsBody {
  adjustment_ids: string[]
  dry_run: boolean
}

const PAID_STATUSES = [
  "captured",
  "partially_captured",
  "partially_refunded",
  "refunded",
]

const loadLines = async (
  req: MedusaRequest,
  id: string
): Promise<{ order: any; lines: OrderLineWithAdjustments[] }> => {
  const orderModule = req.scope.resolve(Modules.ORDER)

  let order: any
  try {
    order = await orderModule.retrieveOrder(id, {
      relations: ["items.adjustments"],
    })
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${id}" not found`)
  }

  const lines = (order.items ?? []).map((item: any) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    unit_price: item.unit_price,
    adjustments: item.adjustments ?? [],
  }))

  return { order, lines }
}

const subtotalOf = (lines: OrderLineWithAdjustments[]): number =>
  lines.reduce((sum, l) => sum + Number(l.unit_price ?? 0) * Number(l.quantity ?? 0), 0)

/**
 * Report leaked adjustment rows. Read-only.
 *
 * A promoted line should carry exactly one adjustment row per promotion. More
 * than one means an order-edit confirm failed and rolled back without cleaning
 * up — see lib/plan-order-adjustment-repair.ts for why.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const { order, lines } = await loadLines(req, id)
  const plan = planOrderAdjustmentRepair(lines)

  const subtotal = subtotalOf(lines)

  res.status(200).json({
    order_id: order.id,
    display_id: order.display_id,
    version: order.version,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    repairable: !PAID_STATUSES.includes(order.payment_status),
    subtotal,
    recorded_discount: plan.recorded_discount_total,
    recorded_total: subtotal - plan.recorded_discount_total,
    duplicate_groups: plan.duplicate_groups,
    clean_group_count: plan.clean_group_count,
    deletable_ids: plan.deletable_ids,
  })
}

/**
 * Soft-delete the adjustment ids the caller names.
 *
 * Deliberately dumb: it deletes exactly what it is given and infers nothing.
 * An id is accepted only if it is one of the rows GET listed as deletable,
 * which means it belongs to this order and is not the last row for its
 * promotion. Soft delete, so `restoreOrderLineItemAdjustments` undoes it.
 */
export const POST = async (
  req: MedusaRequest<AdminRepairOrderAdjustmentsBody>,
  res: MedusaResponse
) => {
  const { id } = req.params
  const { adjustment_ids, dry_run } = req.validatedBody

  const { order, lines } = await loadLines(req, id)

  if (PAID_STATUSES.includes(order.payment_status)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Cannot repair adjustments on an order with payment_status "${order.payment_status}"`
    )
  }

  const plan = planOrderAdjustmentRepair(lines)
  const deletable = new Set(plan.deletable_ids)
  const requested = [...new Set(adjustment_ids)]

  const rejected = requested.filter((adjId) => !deletable.has(adjId))
  if (rejected.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `These ids are not deletable on order "${id}": ${rejected.join(", ")}. ` +
        `An id must belong to this order and must not be the only remaining row ` +
        `for its promotion. GET this route to see the deletable ids.`
    )
  }

  const subtotal = subtotalOf(lines)
  const removed = lines
    .flatMap((l) => l.adjustments ?? [])
    .filter((a) => requested.includes(a.id))
    .reduce((sum, a) => sum + Number(a.amount), 0)

  const projected_discount = plan.recorded_discount_total - removed
  const summary = {
    order_id: order.id,
    display_id: order.display_id,
    dry_run,
    deleted_ids: requested,
    deleted_count: requested.length,
    discount_before: plan.recorded_discount_total,
    discount_after: projected_discount,
    total_before: subtotal - plan.recorded_discount_total,
    total_after: subtotal - projected_discount,
  }

  if (dry_run) {
    res.status(200).json({ ...summary, applied: false })
    return
  }

  const orderModule = req.scope.resolve(Modules.ORDER)
  await orderModule.softDeleteOrderLineItemAdjustments(requested)

  // read back so the response reports what the order actually says now,
  // not what we predicted
  const after = await loadLines(req, id)
  const afterPlan = planOrderAdjustmentRepair(after.lines)
  const afterSubtotal = subtotalOf(after.lines)

  res.status(200).json({
    ...summary,
    applied: true,
    observed_discount_after: afterPlan.recorded_discount_total,
    observed_total_after: afterSubtotal - afterPlan.recorded_discount_total,
    remaining_duplicate_groups: afterPlan.duplicate_groups.length,
  })
}
