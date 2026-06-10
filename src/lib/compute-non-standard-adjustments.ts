import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"
import { spreadCartAdjustment } from "./adjustment-spread"
import { computeBundle, computeBuyGetRepeat, resolveExclusiveNonStandard, capAdjustmentsToSubtotal, type PromotionAdjustmentGroup } from "./adjustment-calculator"
import { filterEligibleItems, type CartItemForTargetRules } from "./target-rule-evaluator"
import { restoreEvictedStandardPromos } from "./restore-evicted-standard-promos"

export async function computeNonStandardAdjustments(
  cartId: string,
  container: any,
  options?: { appliedPromotionCodes?: string[]; freshlyLinkedCodes?: string[] }
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)

  const allConfigs = await service.listPromotionExtConfigs({})
  const nonStandardConfigs = allConfigs.filter(
    (c: any) => c.promotion_mode && c.promotion_mode !== "standard"
  )

  if (!nonStandardConfigs.length && !options?.freshlyLinkedCodes?.length) return

  const appliedCodes = await resolveAppliedCodes(cartId, query, options?.appliedPromotionCodes)

  const { data: appliedPromos } = await query.graph({
    entity: "promotion",
    fields: [
      "id",
      "code",
      "is_tax_inclusive",
      "application_method.type",
      "application_method.value",
      "application_method.max_quantity",
      "application_method.target_rules.attribute",
      "application_method.target_rules.operator",
      "application_method.target_rules.values.value",
    ],
    filters: { id: nonStandardConfigs.map((c: any) => c.promotion_id) },
  })

  const { data: cartWithProducts } = await query.graph({
    entity: "cart",
    fields: [
      "items.id",
      "items.unit_price",
      "items.is_tax_inclusive",
      "items.tax_lines.rate",
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

  const allComputedGroups: (PromotionAdjustmentGroup & { code: string; mode: string; is_tax_inclusive: boolean })[] = []

  for (const cfg of nonStandardConfigs) {
    const promo = appliedPromos.find((p: any) => p.id === (cfg as any).promotion_id)
    if (!promo) continue

    const isApplied = appliedCodes.includes(promo.code)
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
      const unitPrice = typeof cartItem?.unit_price === "number" ? cartItem.unit_price : Number(cartItem?.unit_price ?? 0)
      const qty = typeof cartItem?.quantity === "number" ? cartItem.quantity : Number(cartItem?.quantity ?? 0)
      const isTaxInclusive = cartItem?.is_tax_inclusive ?? false
      const taxRate = (cartItem?.tax_lines ?? []).reduce((sum: number, tl: any) => sum + (Number(tl.rate) || 0), 0)
      const unitSubtotal = isTaxInclusive && taxRate > 0 ? unitPrice / (1 + taxRate / 100) : unitPrice
      return {
        id: ei.id,
        unit_price: unitPrice,
        subtotal: unitSubtotal * qty,
        quantity: qty,
      }
    })

    const modeConfig = (cfg as any).mode_config
    const promotionMode = (cfg as any).promotion_mode as string
    const am = (promo as any).application_method

    let computedGroup: PromotionAdjustmentGroup

    if (promotionMode === "bundle") {
      computedGroup = computeBundle((cfg as any).promotion_id, eligibleWithPrices, modeConfig, {
        value: typeof am?.value === "number" ? am.value : Number(am?.value ?? 0),
        max_quantity: am?.max_quantity ?? null,
        is_tax_inclusive: (promo as any).is_tax_inclusive ?? false,
      })
    } else if (promotionMode === "buyget_repeat") {
      computedGroup = computeBuyGetRepeat((cfg as any).promotion_id, eligibleWithPrices, modeConfig, {
        type: am?.type === "percentage" ? "percentage" : "fixed",
        value: typeof am?.value === "number" ? am.value : Number(am?.value ?? 0),
        max_quantity: am?.max_quantity ?? null,
        is_tax_inclusive: (promo as any).is_tax_inclusive ?? false,
      })
    } else {
      continue
    }

    allComputedGroups.push({
      ...computedGroup,
      code: promo.code,
      mode: promotionMode,
      is_tax_inclusive: (promo as any).is_tax_inclusive ?? false,
    })
  }

  const winners = resolveExclusiveNonStandard(allComputedGroups)
  const winnerIds = new Set(winners.map((w) => w.promotion_id))

  for (const group of allComputedGroups) {
    const oldRows = await service.listCartExtAdjustments({
      cart_id: cartId,
      promotion_id: group.promotion_id,
      source: group.mode,
    })
    if (oldRows.length) {
      await service.deleteCartExtAdjustments(oldRows.map((r: any) => r.id))
    }

    if (winnerIds.has(group.promotion_id) && group.adjustments.length) {
      await service.createCartExtAdjustments(
        group.adjustments.map((adj) => ({
          cart_id: cartId,
          item_id: adj.item_id,
          amount: adj.amount,
          code: group.code,
          source: group.mode,
          promotion_id: group.promotion_id,
          description: `${group.mode === "bundle" ? "Bundle" : "Buy-get repeat"} promotion: ${group.code}`,
          is_tax_inclusive: group.is_tax_inclusive,
        }))
      )
    } else {
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      await remoteLink.dismiss({
        [Modules.CART]: { cart_id: cartId },
        [Modules.PROMOTION]: { promotion_id: group.promotion_id },
      })
    }
  }

  await applyExtAdjustmentsToCart(cartId, nonStandardConfigs, container, options?.freshlyLinkedCodes)
}

async function resolveAppliedCodes(
  cartId: string,
  query: any,
  precomputedCodes?: string[]
): Promise<string[]> {
  if (precomputedCodes) return precomputedCodes

  const { data: cartList } = await query.graph({
    entity: "cart",
    fields: ["promotions.code"],
    filters: { id: cartId },
  })
  return (cartList[0]?.promotions ?? []).map((p: any) => p.code)
}

async function applyExtAdjustmentsToCart(
  cartId: string,
  nonStandardConfigs: any[],
  container: any,
  freshlyLinkedCodes?: string[]
): Promise<void> {
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
  const cartExtAdjustments = await service.listCartExtAdjustments({ cart_id: cartId })
  const customModePromoIds = new Set(nonStandardConfigs.map((c: any) => c.promotion_id))
  const hasCustomAdjustments = cartExtAdjustments.length > 0
  const hasCustomModePromos = customModePromoIds.size > 0

  if (!hasCustomAdjustments && !hasCustomModePromos && !freshlyLinkedCodes?.length) return

  const cartModule = container.resolve(Modules.CART)
  const fullCart = await cartModule.retrieveCart(cartId, { relations: ["items.adjustments", "items"] })

  const preservedAdjustments: { id: string; item_id: string; code: string; amount: number; is_tax_inclusive: boolean; description?: string; promotion_id?: string; provider_id?: string; metadata?: Record<string, unknown> }[] = []
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
        is_tax_inclusive: adj.is_tax_inclusive ?? false,
        description: adj.description ?? undefined,
        promotion_id: adj.promotion_id ?? undefined,
        provider_id: adj.provider_id ?? undefined,
        metadata: adj.metadata ?? undefined,
      })
    }
  }

  const customAdjustments: { item_id: string; code: string; amount: number; is_tax_inclusive: boolean; description?: string; promotion_id?: string; provider_id?: string; metadata?: Record<string, unknown> }[] = []

  const itemSpecific = cartExtAdjustments.filter((adj: any) => adj.item_id)
  const deduped = deduplicateExtAdjustments(itemSpecific)
  for (const adj of deduped) {
    customAdjustments.push({
      item_id: (adj as any).item_id,
      code: (adj as any).code,
      amount: typeof (adj as any).amount === "number" ? (adj as any).amount : Number((adj as any).amount),
      is_tax_inclusive: (adj as any).is_tax_inclusive ?? false,
      description: (adj as any).description ?? undefined,
      promotion_id: (adj as any).promotion_id ?? undefined,
      provider_id: (adj as any).provider_id ?? undefined,
      metadata: (adj as any).metadata ?? undefined,
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
          is_tax_inclusive: (adj as any).is_tax_inclusive ?? false,
          description: (adj as any).description ?? undefined,
          promotion_id: (adj as any).promotion_id ?? undefined,
          provider_id: (adj as any).provider_id ?? undefined,
          metadata: (adj as any).metadata ?? undefined,
        })
      }
    }
  }

  const restoredAdjustments = await restoreEvictedStandardPromos(cartId, customModePromoIds, container, {
    freshlyLinkedCodes: freshlyLinkedCodes?.length ? new Set(freshlyLinkedCodes) : undefined,
  })

  const itemSubtotals = new Map<string, number>()
  for (const item of (fullCart.items ?? [])) {
    const unitPrice = typeof item.unit_price === "number" ? item.unit_price : Number(item.unit_price ?? 0)
    const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity ?? 0)
    itemSubtotals.set((item as any).id, unitPrice * qty)
  }

  const cappedAdjustments = capAdjustmentsToSubtotal(
    itemSubtotals,
    customAdjustments,
    [...preservedAdjustments, ...restoredAdjustments]
  )

  await cartModule.setLineItemAdjustments(cartId, cappedAdjustments)
}

function deduplicateExtAdjustments(adjustments: any[]): any[] {
  const seen = new Map<string, any>()
  for (const adj of adjustments) {
    if (!adj.promotion_id) {
      seen.set(adj.id ?? `manual_${seen.size}`, adj)
      continue
    }
    const key = `${adj.promotion_id}:${adj.item_id}`
    if (!seen.has(key)) {
      seen.set(key, adj)
    }
  }
  return Array.from(seen.values())
}
