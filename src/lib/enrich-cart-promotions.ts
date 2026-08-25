import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext/constants"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

function collectPromotionIds(cart: any): Set<string> {
  const ids = new Set<string>()

  for (const promo of cart.promotions ?? []) {
    if (promo.id) ids.add(promo.id)
  }

  for (const item of cart.items ?? []) {
    for (const adj of item.adjustments ?? []) {
      if (adj.promotion?.id) ids.add(adj.promotion.id)
    }
  }

  return ids
}

export async function enrichCartPromotionsWithAutoApply(
  cart: any,
  container: any
): Promise<void> {
  const promotionIds = collectPromotionIds(cart)
  if (promotionIds.size === 0) return

  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
  const configs = await service.listPromotionExtConfigs({
    promotion_id: [...promotionIds],
  })

  const autoApplyMap = new Map<string, boolean>()
  for (const config of configs) {
    autoApplyMap.set(config.promotion_id, config.auto_apply)
  }

  for (const promo of cart.promotions ?? []) {
    promo.auto_apply = autoApplyMap.get(promo.id) ?? false
  }

  for (const item of cart.items ?? []) {
    for (const adj of item.adjustments ?? []) {
      if (adj.promotion) {
        adj.promotion.auto_apply = autoApplyMap.get(adj.promotion.id) ?? false
      }
    }
  }
}

export async function enrichCartPromotionsWithMetadata(
  cart: any,
  container: any
): Promise<void> {
  const promotionIds = collectPromotionIds(cart)
  if (promotionIds.size === 0) return

  const query = container.resolve("query")
  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: ["id", "metadata"],
    filters: { id: [...promotionIds] },
  })

  const metadataMap = new Map<string, Record<string, unknown>>()
  for (const promo of promotions) {
    metadataMap.set(promo.id, promo.metadata ?? {})
  }

  for (const promo of cart.promotions ?? []) {
    promo.metadata = metadataMap.get(promo.id) ?? {}
  }

  for (const item of cart.items ?? []) {
    for (const adj of item.adjustments ?? []) {
      if (adj.promotion) {
        adj.promotion.metadata = metadataMap.get(adj.promotion.id) ?? {}
      }
    }
  }
}
