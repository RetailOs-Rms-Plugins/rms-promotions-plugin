import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import { evaluatePromotion } from "../lib/rule-evaluator"
import { buildEnrichedCart, loadConfigShape, passesNativeRules } from "../lib/cart-enricher"
import { evaluateAutoApplyPromotions } from "../lib/evaluate-auto-apply-promotions"
import { computeNonStandardAdjustments } from "../lib/compute-non-standard-adjustments"

// Async fallback for promotion evaluation. The primary synchronous path is
// the beforeRefreshingPaymentCollection hook (src/subscribers/sync-non-standard-adjustments.ts).
// This subscriber covers cart mutation paths not covered by route overrides
// (e.g., shipping method changes, customer assignment, admin operations).
export default async function cartUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const cartId = data.id

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  // ── Pass 1: Auto-apply evaluation (uses direct links, safe everywhere) ──
  const { added: actualToAdd, removed: actualToRemove } =
    await evaluateAutoApplyPromotions(cartId, container)

  // ── Pass 2: Re-evaluate code-applied promos with ext-rules ──
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
  if (!cart) return

  const appliedCodes = new Set<string>((cart?.promotions ?? []).map((p: any) => p.code))
  const appliedPromoIds = new Set<string>((cart?.promotions ?? []).map((p: any) => p.id))

  const allConfigs = await service.listPromotionExtConfigs({})
  const autoApplyPromoIds = new Set(
    allConfigs.filter((c: any) => c.auto_apply).map((c) => c.promotion_id)
  )

  const codeAppliedToReEvaluate = allConfigs.filter((c) => {
    if (autoApplyPromoIds.has(c.promotion_id)) return false
    return appliedPromoIds.has(c.promotion_id)
  })

  const codeAppliedToRemove: { id: string; code: string }[] = []

  if (codeAppliedToReEvaluate.length) {
    const promoIds = codeAppliedToReEvaluate.map((c) => c.promotion_id)

    const { data: codePromos } = await query.graph({
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
      filters: { id: promoIds },
    })

    const now = new Date()

    for (const promotion of codePromos) {
      const configShape = await loadConfigShape(promotion.id, container)
      if (!configShape) continue

      const isActive =
        promotion.status === "active" &&
        (!promotion.starts_at || new Date(promotion.starts_at) <= now) &&
        (!promotion.ends_at || new Date(promotion.ends_at) >= now) &&
        passesNativeRules(promotion, cart)

      if (!isActive) {
        codeAppliedToRemove.push({ id: promotion.id, code: promotion.code })
        continue
      }

      const enrichedCart = await buildEnrichedCart(cartId, promotion.id, configShape, container)
      const passes = evaluatePromotion(configShape, enrichedCart)

      if (!passes) {
        codeAppliedToRemove.push({ id: promotion.id, code: promotion.code })
      }
    }

    if (codeAppliedToRemove.length) {
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      await remoteLink.dismiss(
        codeAppliedToRemove.map((p) => ({
          [Modules.CART]: { cart_id: cartId },
          [Modules.PROMOTION]: { promotion_id: p.id },
        }))
      )
    }
  }

  // ── Compute non-standard adjustments with final applied codes ──
  const removedCodes = new Set([
    ...actualToRemove,
    ...codeAppliedToRemove.map((p) => p.code),
  ])
  const appliedPromotionCodes = [...appliedCodes, ...actualToAdd].filter((c) => !removedCodes.has(c))

  await computeNonStandardAdjustments(cartId, container, {
    appliedPromotionCodes,
  })
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
