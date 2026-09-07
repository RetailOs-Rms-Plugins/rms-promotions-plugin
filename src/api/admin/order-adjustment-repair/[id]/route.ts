import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  planOrderAdjustmentRepair,
  OrderLineWithAdjustments,
} from "../../../../lib/plan-order-adjustment-repair"

interface AdminRepairOrderAdjustmentsBody {
  adjustment_ids: string[]
  dry_run: boolean
}

/**
 * Two reads, because neither source has everything.
 *
 * `retrieveOrder` is the only one that returns the adjustment rows. It does
 * NOT carry `payment_status` — that is computed by the HTTP layer, and so is
 * `undefined` both on the module and through Query. A guard written against
 * it passes silently on a captured order, which a local run against
 * medusa-backend caught: an order the Admin API reported as `captured` came
 * back `undefined` here and was reported repairable.
 *
 * So the guard reads the money instead of a derived string: Query returns
 * `payment_collections.captured_amount`, which is a real column. "Has any
 * money actually been captured" is the property we care about anyway.
 */
const loadOrder = async (
  req: MedusaRequest,
  id: string
): Promise<{
  order: any
  captured_total: number
  collections: { id: string; status: string; amount: number; captured_amount: number }[]
  lines: OrderLineWithAdjustments[]
}> => {
  const orderModule = req.scope.resolve(Modules.ORDER)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  let order: any
  try {
    order = await orderModule.retrieveOrder(id, {
      relations: ["items.adjustments"],
    })
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${id}" not found`)
  }

  const {
    data: [withPayments],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.amount",
      "payment_collections.captured_amount",
    ],
    filters: { id },
  })

  if (!withPayments) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${id}" not found`)
  }

  const collections = (withPayments.payment_collections ?? []).map((pc: any) => ({
    id: pc.id,
    status: pc.status,
    amount: Number(pc.amount ?? 0),
    captured_amount: Number(pc.captured_amount ?? 0),
  }))

  const captured_total = collections.reduce(
    (sum: number, pc: any) => sum + (Number.isFinite(pc.captured_amount) ? pc.captured_amount : 0),
    0
  )

  const lines = (order.items ?? []).map((item: any) => ({
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    unit_price: item.unit_price,
    adjustments: item.adjustments ?? [],
  }))

  return { order, captured_total, collections, lines }
}

// unit_price and quantity are BigNumbers off the order module, so coerce.
const subtotalOf = (lines: OrderLineWithAdjustments[]): number =>
  lines.reduce((sum, l) => sum + Number(l.unit_price ?? 0) * Number(l.quantity ?? 0), 0)

// Money has moved. Do not touch the order's discounts.
const isPaid = (captured_total: number): boolean => captured_total > 0

/**
 * Report leaked adjustment rows. Read-only.
 *
 * A promoted line should carry exactly one adjustment row per promotion. More
 * than one means an order-edit confirm failed and rolled back without cleaning
 * up — see lib/plan-order-adjustment-repair.ts for why.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const { order, lines, captured_total, collections } = await loadOrder(req, id)
  const plan = planOrderAdjustmentRepair(lines)

  const subtotal = subtotalOf(lines)

  res.status(200).json({
    order_id: order.id,
    display_id: order.display_id,
    version: order.version,
    captured_total,
    payment_collections: collections,
    repairable: !isPaid(captured_total),
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

  const { order, lines, captured_total } = await loadOrder(req, id)

  if (isPaid(captured_total)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Cannot repair adjustments on order "${id}": ${captured_total} has already been captured. ` +
        `Repairing discounts after money has moved would leave the order and the payment disagreeing.`
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
  const after = await loadOrder(req, id)
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
