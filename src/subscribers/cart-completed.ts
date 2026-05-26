import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

export default async function cartCompletedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const cartId = data.id
  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
  const adjustments = await service.listCartExtAdjustments({ cart_id: cartId })

  if (!adjustments.length) return

  const ids = adjustments.map((adj: any) => adj.id)
  await service.deleteCartExtAdjustments(ids)
}

export const config: SubscriberConfig = {
  event: "cart.completed",
}
