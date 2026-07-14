import type { MedusaContainer } from "@medusajs/framework"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { evaluatePromotion } from "./rule-evaluator"
import { buildEnrichedCart, loadConfigShape } from "./cart-enricher"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

export async function validateCheckout(cart: any, container: MedusaContainer): Promise<void> {
  const cartId = (cart as any).id
  const appliedPromotions: any[] = (cart as any).promotions ?? []

  for (const promotion of appliedPromotions) {
    const configShape = await loadConfigShape(promotion.id, container)
    if (!configShape) continue

    const enrichedCart = await buildEnrichedCart(cartId, promotion.id, configShape, container)
    const passes = evaluatePromotion(configShape, enrichedCart)

    if (!passes) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Promotion "${promotion.code}" conditions are no longer met. Please review your cart before completing the order.`
      )
    }
  }

  const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
  const cartExtAdjustments = await service.listCartExtAdjustments({ cart_id: cartId })

  if (cartExtAdjustments.length) {
    const cartModule = container.resolve(Modules.CART)
    const fullCart = await cartModule.retrieveCart(cartId, { relations: ["items.adjustments"] })
    const allMedusaCodes = new Set<string>(
      (fullCart.items ?? []).flatMap(
        (item: any) => (item.adjustments ?? []).map((adj: any) => adj.code)
      )
    )

    for (const adj of cartExtAdjustments) {
      const code = (adj as any).code as string
      if (!allMedusaCodes.has(code)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Cart adjustments are out of sync. Please refresh your cart and try again."
        )
      }
    }
  }
}
