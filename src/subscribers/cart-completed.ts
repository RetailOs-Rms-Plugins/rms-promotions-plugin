import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

const LOG = "[cart-completed]"

export default async function cartCompletedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const cartId = data.id
  console.log(`${LOG} fired for cart ${cartId}`)

  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
  const adjustments = await service.listCartExtAdjustments({ cart_id: cartId })

  if (!adjustments.length) {
    console.log(`${LOG} no custom adjustments to clean up`)
    return
  }

  const ids = adjustments.map((adj: any) => adj.id)
  await service.deleteCartExtAdjustments(ids)
  console.log(`${LOG} deleted ${ids.length} CartExtAdjustment row(s)`)
}

export const config: SubscriberConfig = {
  event: "cart.completed",
}
