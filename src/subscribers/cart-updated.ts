import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, PromotionActions } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import { evaluatePromotion } from "../lib/rule-evaluator"
import { buildEnrichedCart, loadConfigShape, passesNativeRules } from "../lib/cart-enricher"
import { computeNonStandardAdjustments } from "../lib/compute-non-standard-adjustments"

// Layer 2 — Auto-Apply Engine
export default async function cartUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const cartId = data.id
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  const autoApplyConfigs = await service.listPromotionExtConfigs({ auto_apply: true })
  if (!autoApplyConfigs.length) return

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
      "promotions.code",
    ],
    filters: { id: cartId },
  })

  const cart = cartList[0]
  if (!cart) return

  const appliedCodes = new Set<string>((cart?.promotions ?? []).map((p: any) => p.code))

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
  const toAdd: string[] = []
  const toRemove: string[] = []

  for (const promotion of promotions) {
    const configShape = await loadConfigShape(promotion.id, container)
    if (!configShape) continue

    const isActive =
      promotion.status === "active" &&
      (!promotion.starts_at || new Date(promotion.starts_at) <= now) &&
      (!promotion.ends_at || new Date(promotion.ends_at) >= now) &&
      passesNativeRules(promotion, cart)

    if (!isActive) {
      toRemove.push(promotion.code)
      continue
    }

    const enrichedCart = await buildEnrichedCart(cartId, promotion.id, configShape, container)
    const passes = evaluatePromotion(configShape, enrichedCart)

    if (passes) {
      toAdd.push(promotion.code)
    } else {
      toRemove.push(promotion.code)
    }
  }

  const actualToAdd = toAdd.filter((code) => !appliedCodes.has(code))
  const actualToRemove = toRemove.filter((code) => appliedCodes.has(code))

  if (actualToAdd.length) {
    await updateCartPromotionsWorkflow(container).run({
      input: { cart_id: cartId, promo_codes: actualToAdd, action: PromotionActions.ADD },
    })
  }

  if (actualToRemove.length) {
    await updateCartPromotionsWorkflow(container).run({
      input: { cart_id: cartId, promo_codes: actualToRemove, action: PromotionActions.REMOVE },
    })
  }

  const appliedPromotionCodes = [...appliedCodes, ...actualToAdd].filter((c) => !actualToRemove.includes(c))

  await computeNonStandardAdjustments(cartId, container, {
    appliedPromotionCodes,
  })
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
