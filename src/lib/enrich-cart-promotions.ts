import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext/constants"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

export async function enrichCartPromotionsWithAutoApply(
  cart: any,
  container: any
): Promise<void> {
  const promotionIds = new Set<string>()

  for (const promo of cart.promotions ?? []) {
    if (promo.id) promotionIds.add(promo.id)
  }

  for (const item of cart.items ?? []) {
    for (const adj of item.adjustments ?? []) {
      if (adj.promotion?.id) promotionIds.add(adj.promotion.id)
    }
  }

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
