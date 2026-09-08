import {
  ChangeActionType,
  ContainerRegistrationKeys,
  Modules,
  OrderChangeStatus,
} from "@medusajs/framework/utils"
import { computeAdjustmentsForPreviewWorkflow } from "@medusajs/core-flows"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import type { MoneyValue } from "./plan-order-adjustment-repair"

/**
 * Layer 4 — Order Edit Gate. Reprices a promoted order's adjustments against
 * the edit that is about to be confirmed.
 *
 * Layers 1 to 3 all operate on a cart, so once a cart was an order the amounts
 * froze: raising a line from quantity 3 to 7 kept the quantity-3 discount and
 * over-charged the customer by the difference.
 *
 * Medusa already recomputes here — `computeAdjustmentsForPreviewWorkflow` runs
 * inside every order-edit mutation workflow — but it is gated on
 * `carry_over_promotions`, which `beginOrderEditOrderWorkflow` never sets. So
 * this sets the flag and runs that workflow, then merges back the rows the
 * engine does not price: non-standard mode promotions and operator-created
 * adjustments.
 *
 * @see ADR-0011, docs/BUG-FIX-LOG.md BF-017, issue #117
 */

export interface AdjustmentRow {
  code?: string | null
  promotion_id?: string | null
  amount: MoneyValue
  description?: string | null
  is_tax_inclusive?: boolean | null
}

export interface MergedAdjustment {
  item_id: string
  code: string | null
  promotion_id: string | null
  amount: number
  description?: string | null
  is_tax_inclusive: boolean
}

/**
 * The promotions on this order whose amounts Medusa's engine computes, by id
 * and by code — everything on the order that is not in a non-standard mode.
 */
export interface StandardPromotions {
  ids: Set<string>
  codes: Set<string>
}

const toNumber = (value: MoneyValue | null | undefined): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const isStandardPriced = (row: AdjustmentRow, standard: StandardPromotions): boolean =>
  (!!row.promotion_id && standard.ids.has(row.promotion_id)) ||
  (!!row.code && standard.codes.has(row.code))

export interface RecalcDecision {
  recalc: boolean
  reason: string
}

/**
 * Whether this order edit is worth repricing. Pure.
 */
export const decideOrderEditRecalc = (input: {
  orderChange?: { id: string; carry_over_promotions?: boolean | null } | null
  orderPromotionIds: string[]
  /** promotions in bundle or buy-get repeat mode, which the plugin prices */
  nonStandardPromotionIds: string[]
}): RecalcDecision => {
  const { orderChange, orderPromotionIds, nonStandardPromotionIds } = input

  if (!orderChange?.id) {
    return { recalc: false, reason: "no active order change on this order" }
  }

  if (!orderPromotionIds.length) {
    return { recalc: false, reason: "order has no promotions" }
  }

  const nonStandard = new Set(nonStandardPromotionIds)
  const standard = orderPromotionIds.filter((id) => !nonStandard.has(id))

  if (!standard.length) {
    return {
      recalc: false,
      reason: "every promotion on the order is in a non-standard mode",
    }
  }

  return { recalc: true, reason: `${standard.length} promotion(s) to reprice` }
}

/**
 * The adjustment list a line should end up with, and whether that differs from
 * what Medusa's engine just wrote for it. Pure.
 *
 * A row is replaced only when the engine actually priced its promotion on this
 * line. Everything else is carried over from `existing`, because an
 * ITEM_ADJUSTMENTS_REPLACE action takes the line's whole list with it:
 *
 * - Rows the engine was never asked about — operator-created adjustments, and
 *   bundle and buy-get rows the plugin prices itself.
 * - Rows for a standard promotion the engine returned nothing for. Draft or
 *   expired promotions are invisible to `computeActions`, and so is one whose
 *   rule context could not be built, and none of those are a reason to delete
 *   a discount the customer was already given. Keeping it holds today's amount,
 *   which is a safe failure; dropping it over-charges them silently, the same
 *   harm this module exists to fix. The cost is that a promotion which stopped
 *   qualifying keeps its row — no worse than before the fix.
 */
export const mergePreservedItemAdjustments = (input: {
  item_id: string
  /** rows the engine computed for this line, read off the previewed order */
  computed: AdjustmentRow[]
  /** rows on the line today, before the edit is confirmed */
  existing: AdjustmentRow[]
  standardPromotions: StandardPromotions
}): { adjustments: MergedAdjustment[]; differsFromComputed: boolean } => {
  const { item_id, computed, existing, standardPromotions } = input

  const normalize = (row: AdjustmentRow): MergedAdjustment => ({
    item_id,
    code: row.code ?? null,
    promotion_id: row.promotion_id ?? null,
    amount: toNumber(row.amount),
    ...(row.description ? { description: row.description } : {}),
    is_tax_inclusive: row.is_tax_inclusive ?? false,
  })

  const repriced = computed
    .filter((row) => isStandardPriced(row, standardPromotions))
    .map(normalize)

  // Which promotions the engine spoke about on this line, by both keys.
  const priced = new Set<string>()
  for (const row of repriced) {
    if (row.promotion_id) priced.add(row.promotion_id)
    if (row.code) priced.add(row.code)
  }
  const wasPriced = (row: AdjustmentRow): boolean =>
    (!!row.promotion_id && priced.has(row.promotion_id)) ||
    (!!row.code && priced.has(row.code))

  const preserved = existing.filter((row) => !wasPriced(row)).map(normalize)

  return {
    adjustments: [...repriced, ...preserved],
    // Nothing preserved and nothing dropped means Medusa's own action already
    // says exactly this, so there is no second action to write.
    differsFromComputed: preserved.length > 0 || repriced.length !== computed.length,
  }
}

/**
 * Fields `computeAdjustmentsForPreviewWorkflow` reads off the order. Copied from
 * `@medusajs/core-flows` `order/workflows/order-edit/utils/fields.ts`
 * (`fieldsToComputeAdjustmentsForPreview`), which is not exported.
 */
const ORDER_FIELDS = [
  "id",
  "currency_code",
  "email",
  "sales_channel_id",
  "region_id",
  "customer_id",
  "customer.id",
  "customer.groups.id",
  "shipping_address.country_code",
  "items.id",
  "items.product_id",
  "items.quantity",
  "items.subtotal",
  "items.original_total",
  "items.is_discountable",
  "items.adjustments.id",
  "items.adjustments.code",
  "shipping_methods.id",
  "shipping_methods.subtotal",
  "shipping_methods.original_total",
  "shipping_methods.adjustments.id",
  "shipping_methods.adjustments.code",
  "shipping_methods.shipping_option_id",
  "promotions.id",
  "promotions.code",
]

export async function recalcOrderEditPromotions(
  orderId: string,
  container: any
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderModule = container.resolve(Modules.ORDER)
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { id: orderId },
  })

  if (!order) return

  // Edits only. On an exchange or a claim, `carry_over_promotions` is a toggle
  // the operator sets deliberately, and forcing it true would override that
  // choice. An edit is the case where nothing ever sets it.
  const {
    data: [orderChange],
  } = await query.graph({
    entity: "order_change",
    fields: ["id", "version", "carry_over_promotions"],
    filters: {
      order_id: orderId,
      change_type: "edit",
      status: [OrderChangeStatus.PENDING, OrderChangeStatus.REQUESTED],
    },
  })

  const promotions: { id: string; code?: string | null }[] = order.promotions ?? []
  const promotionIds = promotions.map((p) => p.id)

  const configs = promotionIds.length
    ? await service.listPromotionExtConfigs({ promotion_id: promotionIds })
    : []
  const nonStandardPromotionIds = configs
    .filter((c: any) => c.promotion_mode && c.promotion_mode !== "standard")
    .map((c: any) => c.promotion_id)

  const decision = decideOrderEditRecalc({
    orderChange,
    orderPromotionIds: promotionIds,
    nonStandardPromotionIds,
  })

  if (!decision.recalc) {
    logger.debug(
      `[promotions-ext] order ${orderId}: skipping order-edit promotion recalc — ${decision.reason}`
    )
    return
  }

  const nonStandard = new Set(nonStandardPromotionIds)
  const standardPromotions: StandardPromotions = {
    ids: new Set(promotionIds.filter((id) => !nonStandard.has(id))),
    codes: new Set(
      promotions
        .filter((p) => !nonStandard.has(p.id) && p.code)
        .map((p) => p.code as string)
    ),
  }

  // Under the same lock, on the same key, that every order-edit workflow takes.
  // Without it this races the mutation workflows, which write their own replace
  // actions — the concurrent-writer class BF-016 documents. Released before the
  // confirm handler runs and takes the key itself.
  const locking = container.resolve(Modules.LOCKING)

  await locking.execute(
    orderId,
    async () => {
      // Persist the flag before computing. The compute workflow has a second
      // branch that deletes every ITEM_ADJUSTMENTS_REPLACE action when the flag
      // on the order change reads falsy, and it reads it from the database — so
      // passing it as input alone would delete the actions the first branch
      // just created.
      if (!orderChange.carry_over_promotions) {
        await orderModule.updateOrderChanges({
          id: orderChange.id,
          carry_over_promotions: true,
        })
      }

      await computeAdjustmentsForPreviewWorkflow(container).run({
        input: {
          order: { ...order, promotions },
          orderChange: { ...orderChange, carry_over_promotions: true },
        } as any,
      })

      // The rows on the order right now. Read them from the order module, not
      // from the preview: the preview already has the engine's replace actions
      // applied, so the rows this pass exists to save are gone from it.
      const currentOrder = await orderModule.retrieveOrder(orderId, {
        relations: ["items.adjustments"],
      })
      const existingByItem = new Map<string, AdjustmentRow[]>(
        (currentOrder.items ?? []).map((item: any) => [item.id, item.adjustments ?? []])
      )

      const preview = await orderModule.previewOrderChange(orderId)

      const actions = (preview.items ?? []).flatMap((item: any) => {
        const merged = mergePreservedItemAdjustments({
          item_id: item.id,
          computed: item.adjustments ?? [],
          existing: existingByItem.get(item.id) ?? [],
          standardPromotions,
        })

        if (!merged.differsFromComputed) return []

        return [
          {
            order_change_id: orderChange.id,
            order_id: orderId,
            version: orderChange.version,
            action: ChangeActionType.ITEM_ADJUSTMENTS_REPLACE,
            details: { reference_id: item.id, adjustments: merged.adjustments },
          },
        ]
      })

      if (actions.length) {
        await orderModule.addOrderAction(actions)
      }
    },
    // Same timeout the order-edit workflows use for this key.
    { timeout: 2 }
  )
}
