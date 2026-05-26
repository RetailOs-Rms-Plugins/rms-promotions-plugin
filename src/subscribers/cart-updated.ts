import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, Modules, PromotionActions } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import { evaluatePromotion } from "../lib/rule-evaluator"
import { buildEnrichedCart, loadConfigShape, passesNativeRules } from "../lib/cart-enricher"
import { spreadCartAdjustment } from "../lib/adjustment-spread"
import { computeBundle, computeBuyGetRepeat } from "../lib/adjustment-calculator"
import { filterEligibleItems, type CartItemForTargetRules } from "../lib/target-rule-evaluator"

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

  // Compute bundle/buyget_repeat adjustments for non-standard promotions
  const appliedPromotionCodes = [...appliedCodes, ...actualToAdd]
  const allConfigs = await service.listPromotionExtConfigs({})
  const nonStandardConfigs = allConfigs.filter(
    (c: any) => c.promotion_mode && c.promotion_mode !== "standard"
  )

  if (nonStandardConfigs.length) {
    const { data: appliedPromos } = await query.graph({
      entity: "promotion",
      fields: [
        "id",
        "code",
        "application_method.type",
        "application_method.value",
        "application_method.max_quantity",
        "application_method.target_rules.attribute",
        "application_method.target_rules.operator",
        "application_method.target_rules.values.value",
      ],
      filters: { id: nonStandardConfigs.map((c: any) => c.promotion_id) },
    })

    const cartModule = container.resolve(Modules.CART)

    const { data: cartWithProducts } = await query.graph({
      entity: "cart",
      fields: [
        "items.id",
        "items.unit_price",
        "items.quantity",
        "items.product_id",
        "items.product.collection_id",
        "items.product.categories.id",
        "items.product.type_id",
        "items.product.tags.id",
      ],
      filters: { id: cartId },
    })

    const cartItems: CartItemForTargetRules[] = (cartWithProducts[0]?.items ?? []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      product: item.product ?? {},
    }))

    for (const cfg of nonStandardConfigs) {
      const promo = appliedPromos.find((p: any) => p.id === (cfg as any).promotion_id)
      if (!promo) continue

      const isApplied = appliedPromotionCodes.includes(promo.code)
      if (!isApplied) {
        const staleRows = await service.listCartExtAdjustments({
          cart_id: cartId,
          promotion_id: (cfg as any).promotion_id,
        })
        if (staleRows.length) {
          await service.deleteCartExtAdjustments(staleRows.map((r: any) => r.id))
        }
        continue
      }

      const targetRules = ((promo as any).application_method?.target_rules ?? []).map((r: any) => ({
        attribute: r.attribute,
        operator: r.operator,
        values: (r.values ?? []).map((v: any) => v.value ?? v),
      }))

      const eligibleItems = filterEligibleItems(cartItems, targetRules)

      const eligibleWithPrices = eligibleItems.map((ei) => {
        const cartItem = (cartWithProducts[0]?.items ?? []).find((i: any) => i.id === ei.id)
        return {
          id: ei.id,
          unit_price: typeof cartItem?.unit_price === "number" ? cartItem.unit_price : Number(cartItem?.unit_price ?? 0),
          quantity: typeof cartItem?.quantity === "number" ? cartItem.quantity : Number(cartItem?.quantity ?? 0),
        }
      })

      const modeConfig = (cfg as any).mode_config
      const promotionMode = (cfg as any).promotion_mode as string
      const am = (promo as any).application_method

      let computedGroup: { promotion_id: string; adjustments: { item_id: string; amount: number }[] }

      if (promotionMode === "bundle") {
        computedGroup = computeBundle((cfg as any).promotion_id, eligibleWithPrices, modeConfig, {
          value: typeof am?.value === "number" ? am.value : Number(am?.value ?? 0),
          max_quantity: am?.max_quantity ?? null,
        })
      } else if (promotionMode === "buyget_repeat") {
        computedGroup = computeBuyGetRepeat((cfg as any).promotion_id, eligibleWithPrices, modeConfig, {
          type: am?.type === "percentage" ? "percentage" : "fixed",
          value: typeof am?.value === "number" ? am.value : Number(am?.value ?? 0),
          max_quantity: am?.max_quantity ?? null,
        })
      } else {
        continue
      }

      const oldRows = await service.listCartExtAdjustments({
        cart_id: cartId,
        promotion_id: (cfg as any).promotion_id,
        source: promotionMode,
      })
      if (oldRows.length) {
        await service.deleteCartExtAdjustments(oldRows.map((r: any) => r.id))
      }

      if (computedGroup.adjustments.length) {
        await service.createCartExtAdjustments(
          computedGroup.adjustments.map((adj) => ({
            cart_id: cartId,
            item_id: adj.item_id,
            amount: adj.amount,
            code: `${promotionMode.toUpperCase()}_${promo.code}`,
            source: promotionMode,
            promotion_id: (cfg as any).promotion_id,
            description: `${promotionMode === "bundle" ? "Bundle" : "Buy-get repeat"} promotion: ${promo.code}`,
          }))
        )
      }
    }
  }

  // Re-apply custom adjustments (ADR-0005: re-apply after wipe)
  const cartExtAdjustments = await service.listCartExtAdjustments({ cart_id: cartId })
  const customModePromoIds = new Set(nonStandardConfigs.map((c: any) => c.promotion_id))
  const hasCustomAdjustments = cartExtAdjustments.length > 0
  const hasCustomModePromos = customModePromoIds.size > 0

  if (hasCustomAdjustments || hasCustomModePromos) {
    const cartModule = container.resolve(Modules.CART)
    const fullCart = await cartModule.retrieveCart(cartId, { relations: ["items.adjustments", "items"] })

    const preservedAdjustments: { id: string; item_id: string; code: string; amount: number; description?: string; promotion_id?: string; provider_id?: string }[] = []
    for (const item of (fullCart.items ?? [])) {
      for (const adj of ((item as any).adjustments ?? [])) {
        if (customModePromoIds.has(adj.promotion_id)) {
          continue
        }
        preservedAdjustments.push({
          id: adj.id,
          item_id: (item as any).id,
          code: adj.code,
          amount: typeof adj.amount === "number" ? adj.amount : Number(adj.amount),
          description: adj.description ?? undefined,
          promotion_id: adj.promotion_id ?? undefined,
          provider_id: adj.provider_id ?? undefined,
        })
      }
    }

    const customAdjustments: { item_id: string; code: string; amount: number; description?: string; promotion_id?: string; provider_id?: string }[] = []

    const itemSpecific = cartExtAdjustments.filter((adj: any) => adj.item_id)
    for (const adj of itemSpecific) {
      customAdjustments.push({
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
      const cartItems = (fullCart.items ?? []).map((item: any) => {
        const unitPrice = typeof item.unit_price === "number" ? item.unit_price : Number(item.unit_price ?? 0)
        const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity ?? 0)
        return { id: item.id, subtotal: unitPrice * qty }
      })

      for (const adj of cartWide) {
        const amount = typeof (adj as any).amount === "number" ? (adj as any).amount : Number((adj as any).amount)
        const spread = spreadCartAdjustment(amount, cartItems)
        for (const s of spread) {
          customAdjustments.push({
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

    const finalAdjustments = [...preservedAdjustments, ...customAdjustments]
    await cartModule.setLineItemAdjustments(cartId, finalAdjustments)
  }
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
