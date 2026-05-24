import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, Modules, PromotionActions } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import { evaluatePromotion } from "../lib/rule-evaluator"
import { buildEnrichedCart, loadConfigShape, passesNativeRules } from "../lib/cart-enricher"
import { spreadCartAdjustment } from "../lib/adjustment-spread"

const LOG = "[Layer2/cart-updated]"

// Layer 2 — Auto-Apply Engine
export default async function cartUpdatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const cartId = data.id
  console.log(`${LOG} fired for cart ${cartId}`)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  const autoApplyConfigs = await service.listPromotionExtConfigs({ auto_apply: true })
  console.log(`${LOG} auto_apply configs found: ${autoApplyConfigs.length}`, autoApplyConfigs.map(c => ({ id: c.id, promotion_id: c.promotion_id })))

  if (!autoApplyConfigs.length) {
    console.log(`${LOG} no auto_apply configs — exiting early`)
    return
  }

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
  const appliedCodes = new Set<string>((cart?.promotions ?? []).map((p: any) => p.code))
  console.log(`${LOG} cart fetched:`, {
    id: cart?.id,
    item_count: cart?.items?.length,
    items: cart?.items?.map((i: any) => ({ product_id: i.product_id, quantity: i.quantity })),
    applied_promotions: [...appliedCodes],
    customer_id: cart?.customer_id,
  })

  if (!cart) {
    console.log(`${LOG} cart not found — exiting`)
    return
  }

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

  console.log(`${LOG} promotions fetched from Medusa: ${promotions.length}`, promotions.map((p: any) => ({ id: p.id, code: p.code, status: p.status })))

  const now = new Date()
  const toAdd: string[] = []
  const toRemove: string[] = []

  for (const promotion of promotions) {
    console.log(`${LOG} evaluating promotion "${promotion.code}" (${promotion.id})`)

    const configShape = await loadConfigShape(promotion.id, container)
    console.log(`${LOG} configShape loaded:`, JSON.stringify(configShape))

    if (!configShape) {
      console.log(`${LOG} no configShape found — skipping`)
      continue
    }

    const isActive =
      promotion.status === "active" &&
      (!promotion.starts_at || new Date(promotion.starts_at) <= now) &&
      (!promotion.ends_at || new Date(promotion.ends_at) >= now) &&
      passesNativeRules(promotion, cart)

    console.log(`${LOG} isActive: ${isActive}`, {
      status: promotion.status,
      starts_at: promotion.starts_at,
      ends_at: promotion.ends_at,
      passesNativeRules: passesNativeRules(promotion, cart),
    })

    if (!isActive) {
      console.log(`${LOG} promotion not active — queuing REMOVE`)
      toRemove.push(promotion.code)
      continue
    }

    const enrichedCart = await buildEnrichedCart(cartId, promotion.id, configShape, container)
    console.log(`${LOG} enrichedCart:`, JSON.stringify(enrichedCart))

    const passes = evaluatePromotion(configShape, enrichedCart)
    console.log(`${LOG} evaluatePromotion result: ${passes}`)

    if (passes) {
      toAdd.push(promotion.code)
    } else {
      toRemove.push(promotion.code)
    }
  }

  const actualToAdd = toAdd.filter((code) => !appliedCodes.has(code))
  const actualToRemove = toRemove.filter((code) => appliedCodes.has(code))

  console.log(`${LOG} delta — toAdd: ${JSON.stringify(actualToAdd)}, toRemove: ${JSON.stringify(actualToRemove)}`)

  if (actualToAdd.length) {
    console.log(`${LOG} calling updateCartPromotionsWorkflow ADD for: ${actualToAdd}`)
    await updateCartPromotionsWorkflow(container).run({
      input: { cart_id: cartId, promo_codes: actualToAdd, action: PromotionActions.ADD },
    })
  }

  if (actualToRemove.length) {
    console.log(`${LOG} calling updateCartPromotionsWorkflow REMOVE for: ${actualToRemove}`)
    await updateCartPromotionsWorkflow(container).run({
      input: { cart_id: cartId, promo_codes: actualToRemove, action: PromotionActions.REMOVE },
    })
  }

  // Re-apply custom adjustments (ADR-0005: re-apply after wipe)
  const cartExtAdjustments = await service.listCartExtAdjustments({ cart_id: cartId })

  if (cartExtAdjustments.length) {
    const cartModule = container.resolve(Modules.CART)
    const allAdjustmentsToApply: { item_id: string; code: string; amount: number; description?: string; promotion_id?: string; provider_id?: string }[] = []

    const itemSpecific = cartExtAdjustments.filter((adj: any) => adj.item_id)
    for (const adj of itemSpecific) {
      allAdjustmentsToApply.push({
        item_id: (adj as any).item_id,
        code: (adj as any).code,
        amount: typeof (adj as any).amount === "number" ? (adj as any).amount : Number((adj as any).amount),
        description: (adj as any).description ?? undefined,
        promotion_id: (adj as any).promotion_id ?? undefined,
        provider_id: (adj as any).provider_id ?? undefined,
      })
    }

    const cartWide = cartExtAdjustments.filter((adj: any) => !(adj as any).item_id)
    if (cartWide.length) {
      const fullCart = await cartModule.retrieveCart(cartId, { relations: ["items"] })
      const cartItems = (fullCart.items ?? []).map((item: any) => ({
        id: item.id,
        subtotal: typeof item.subtotal === "number" ? item.subtotal : Number(item.subtotal ?? 0),
      }))

      for (const adj of cartWide) {
        const amount = typeof (adj as any).amount === "number" ? (adj as any).amount : Number((adj as any).amount)
        const spread = spreadCartAdjustment(amount, cartItems)
        for (const s of spread) {
          allAdjustmentsToApply.push({
            item_id: s.item_id,
            code: (adj as any).code,
            amount: s.amount,
            description: (adj as any).description ?? undefined,
            promotion_id: (adj as any).promotion_id ?? undefined,
            provider_id: (adj as any).provider_id ?? undefined,
          })
        }
      }
    }

    if (allAdjustmentsToApply.length) {
      await cartModule.addLineItemAdjustments(cartId, allAdjustmentsToApply)
      console.log(`${LOG} re-applied ${allAdjustmentsToApply.length} custom adjustment(s) (${itemSpecific.length} item-specific, ${cartWide.length} cart-wide)`)
    }
  }

  console.log(`${LOG} done`)
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
