/**
 * Evaluate auto-apply promotions and add/remove them from the cart.
 *
 * This function checks all promotion ext configs with `auto_apply: true`,
 * evaluates their rules (native + ext) against the current cart state,
 * and adds or removes promotions accordingly via direct link manipulation
 * (remoteLink.create / remoteLink.dismiss).
 *
 * ## Where this function is called
 *
 * 1. **Workflow hook** (beforeRefreshingPaymentCollection)
 *    Runs inside the distributed lock — no concurrent writers.
 *
 * 2. **cart.updated subscriber** (async fallback)
 *    As a safety net for any cart mutation path not covered by route
 *    overrides (e.g., shipping method changes, customer assignment).
 *
 * Uses direct link manipulation instead of updateCartPromotionsWorkflow
 * to avoid deadlocking when called inside a workflow hook. The workflow
 * calls .run() which tries to acquire the cart lock that the parent
 * workflow already holds. Direct links bypass this. Same pattern as
 * restoreEvictedStandardPromos (ADR-0009).
 */

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import { evaluatePromotion } from "./rule-evaluator"
import { buildEnrichedCart, loadConfigShape, passesNativeRules } from "./cart-enricher"

export interface AutoApplyResult {
  added: string[]
  removed: string[]
}

export async function evaluateAutoApplyPromotions(
  cartId: string,
  container: any
): Promise<AutoApplyResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  const autoApplyConfigs = await service.listPromotionExtConfigs({ auto_apply: true })
  if (!autoApplyConfigs.length) return { added: [], removed: [] }

  const promotionIds = autoApplyConfigs.map((c) => c.promotion_id)

  const { data: cartList } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "region_id",
      "sales_channel_id",
      "currency_code",
      "customer_id",
      "items.quantity",
      "items.product_id",
      "items.product.collection_id",
      "customer.id",
      "customer.groups.id",
      "promotions.id",
      "promotions.code",
    ],
    filters: { id: cartId },
  })

  const cart = cartList[0]
  if (!cart) return { added: [], removed: [] }

  const linkedPromoIds = new Set<string>((cart.promotions ?? []).map((p: any) => p.id))
  const linkedCodeToId = new Map<string, string>(
    (cart.promotions ?? []).map((p: any) => [p.code, p.id])
  )

  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: [
      "id",
      "code",
      "status",
      "starts_at",
      "ends_at",
      "rules.attribute",
      "rules.operator",
      "rules.values.value",
    ],
    filters: { id: promotionIds },
  })

  const now = new Date()
  const toAdd: { id: string; code: string }[] = []
  const toRemove: { id: string; code: string }[] = []

  for (const promotion of promotions) {
    const configShape = await loadConfigShape(promotion.id, container)
    if (!configShape) continue

    const isActive =
      promotion.status === "active" &&
      (!promotion.starts_at || new Date(promotion.starts_at) <= now) &&
      (!promotion.ends_at || new Date(promotion.ends_at) >= now) &&
      passesNativeRules(promotion, cart)

    if (!isActive) {
      if (linkedPromoIds.has(promotion.id)) {
        toRemove.push({ id: promotion.id, code: promotion.code })
      }
      continue
    }

    const enrichedCart = await buildEnrichedCart(cartId, promotion.id, configShape, container)
    const passes = evaluatePromotion(configShape, enrichedCart)

    if (passes && !linkedPromoIds.has(promotion.id)) {
      toAdd.push({ id: promotion.id, code: promotion.code })
    } else if (!passes && linkedPromoIds.has(promotion.id)) {
      toRemove.push({ id: promotion.id, code: promotion.code })
    }
  }

  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

  if (toAdd.length) {
    await remoteLink.create(
      toAdd.map((p) => ({
        [Modules.CART]: { cart_id: cartId },
        [Modules.PROMOTION]: { promotion_id: p.id },
      }))
    )
  }

  if (toRemove.length) {
    await remoteLink.dismiss(
      toRemove.map((p) => ({
        [Modules.CART]: { cart_id: cartId },
        [Modules.PROMOTION]: { promotion_id: p.id },
      }))
    )
  }

  return {
    added: toAdd.map((p) => p.code),
    removed: toRemove.map((p) => p.code),
  }
}
