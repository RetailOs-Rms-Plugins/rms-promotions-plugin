import type { MedusaContainer } from "@medusajs/framework"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

export async function cleanupCartExtAdjustments(cartId: string, container: MedusaContainer): Promise<void> {
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
  const adjustments = await service.listCartExtAdjustments({ cart_id: cartId })

  if (!adjustments.length) return

  const ids = adjustments.map((adj: any) => adj.id)
  await service.deleteCartExtAdjustments(ids)
}
