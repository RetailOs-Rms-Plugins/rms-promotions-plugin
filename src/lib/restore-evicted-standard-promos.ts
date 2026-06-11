/**
 * Restore standard auto-apply promotions evicted by budget contamination.
 *
 * Medusa's computeActions uses a shared budget map across all promotions.
 * Non-standard promotions (bundle, buyget_repeat) consume budget with their
 * native application_method.value, which can exhaust the remaining budget
 * for standard promotions computed later. When a standard promotion produces
 * zero adjustments, updateCartPromotionsStep(REPLACE) removes it from the
 * cart entirely.
 *
 * This function detects evicted standard promos, re-links them to the cart,
 * computes their adjustments independently (clean budget), and adds them
 * to the cart's line item adjustments.
 *
 * See ADR-0009 for full context.
 */

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import { evaluatePromotion } from "./rule-evaluator"
import { buildEnrichedCart, loadConfigShape, passesNativeRules } from "./cart-enricher"

interface RestoredAdjustment {
  item_id: string
  code: string
  amount: number
  is_tax_inclusive: boolean
  promotion_id: string
}

export async function restoreEvictedStandardPromos(
  cartId: string,
  customModePromoIds: Set<string>,
  container: any,
  options?: { freshlyLinkedCodes?: Set<string> }
): Promise<RestoredAdjustment[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  const allConfigs = await service.listPromotionExtConfigs({ auto_apply: true })
  const standardAutoApply = allConfigs.filter(
    (c: any) => !c.promotion_mode || c.promotion_mode === "standard"
  )

  if (!standardAutoApply.length) return []

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
  if (!cart) return []

  const linkedPromoIds = new Set<string>(
    (cart.promotions ?? []).map((p: any) => p.id)
  )

  const standardPromoIds = standardAutoApply.map((c) => c.promotion_id)
  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: [
      "id",
      "code",
      "status",
      "starts_at",
      "ends_at",
      "is_tax_inclusive",
      "rules.attribute",
      "rules.operator",
      "rules.values.value",
    ],
    filters: { id: standardPromoIds },
  })

  const now = new Date()
  const evictedPromos: { id: string; code: string; is_tax_inclusive: boolean }[] = []

  for (const promotion of promotions) {
    if (linkedPromoIds.has(promotion.id) && !options?.freshlyLinkedCodes?.has(promotion.code)) continue

    const isActive =
      promotion.status === "active" &&
      (!promotion.starts_at || new Date(promotion.starts_at) <= now) &&
      (!promotion.ends_at || new Date(promotion.ends_at) >= now) &&
      passesNativeRules(promotion, cart)

    if (!isActive) continue

    const configShape = await loadConfigShape(promotion.id, container)
    if (!configShape) continue

    const enrichedCart = await buildEnrichedCart(cartId, promotion.id, configShape, container)
    if (!evaluatePromotion(configShape, enrichedCart)) continue

    evictedPromos.push({
      id: promotion.id,
      code: promotion.code,
      is_tax_inclusive: (promotion as any).is_tax_inclusive ?? false,
    })
  }

  if (!evictedPromos.length) return []

  const promotionService = container.resolve(Modules.PROMOTION)

  const { data: freshCart } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "currency_code",
      "region_id",
      "sales_channel_id",
      "items.*",
      "items.product.id",
      "items.product.is_giftcard",
      "items.product.collection_id",
      "items.product.categories.id",
      "items.product.tags.id",
      "items.product.type_id",
      "items.variant.id",
      "items.variant.product.id",
      "items.adjustments.*",
      "items.tax_lines.*",
      "shipping_methods.*",
      "shipping_methods.adjustments.*",
      "shipping_methods.tax_lines.*",
      "customer.*",
      "customer.groups.*",
    ],
    filters: { id: cartId },
  })

  const cleanCart = freshCart[0]
  if (!cleanCart) return []

  const cleanItems = (cleanCart.items ?? []).map((item: any) => {
    const unitPrice = typeof item.unit_price === "number" ? item.unit_price : Number(item.unit_price ?? 0)
    const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity ?? 0)
    const isTaxInclusive = item.is_tax_inclusive ?? false
    const taxRate = (item.tax_lines ?? []).reduce((sum: number, tl: any) => sum + (Number(tl.rate) || 0), 0)
    const unitSubtotal = isTaxInclusive && taxRate > 0 ? unitPrice / (1 + taxRate / 100) : unitPrice
    const lineSubtotal = unitSubtotal * qty
    return {
      ...item,
      subtotal: lineSubtotal,
      original_total: item.original_total ?? unitPrice * qty,
      adjustments: [],
    }
  })

  const cleanShippingMethods = (cleanCart.shipping_methods ?? []).map((sm: any) => ({
    ...sm,
    adjustments: [],
  }))

  const cleanContext = {
    ...cleanCart,
    items: cleanItems,
    shipping_methods: cleanShippingMethods,
  }

  const evictedCodes = evictedPromos.map((p) => p.code)

  const actions = await promotionService.computeActions(evictedCodes, cleanContext, {
    prevent_auto_promotions: true,
  })

  const codesWithAdjustments = new Set<string>()
  for (const action of actions) {
    if ((action as any).action === "addItemAdjustment") {
      codesWithAdjustments.add((action as any).code)
    }
  }

  const promosWithAdjustments = evictedPromos.filter((p) =>
    codesWithAdjustments.has(p.code)
  )

  if (!promosWithAdjustments.length) return []

  const promosToLink = promosWithAdjustments.filter(
    (p) => !options?.freshlyLinkedCodes?.has(p.code)
  )

  if (promosToLink.length) {
    const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
    await remoteLink.create(
      promosToLink.map((p) => ({
        [Modules.CART]: { cart_id: cartId },
        [Modules.PROMOTION]: { promotion_id: p.id },
      }))
    )
  }

  const promoCodeToId = new Map(promosWithAdjustments.map((p) => [p.code, p.id]))
  const promoCodeToTaxInclusive = new Map(promosWithAdjustments.map((p) => [p.code, p.is_tax_inclusive]))

  const restoredAdjustments: RestoredAdjustment[] = []
  for (const action of actions) {
    if ((action as any).action !== "addItemAdjustment") continue
    const promoId = promoCodeToId.get((action as any).code)
    if (!promoId) continue

    restoredAdjustments.push({
      item_id: (action as any).item_id,
      code: (action as any).code,
      amount: typeof (action as any).amount === "number"
        ? (action as any).amount
        : Number((action as any).amount ?? 0),
      is_tax_inclusive: promoCodeToTaxInclusive.get((action as any).code) ?? false,
      promotion_id: promoId,
    })
  }

  return restoredAdjustments
}
