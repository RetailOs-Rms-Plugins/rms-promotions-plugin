import type { MedusaContainer } from "@medusajs/framework"
import { MedusaError, PromotionActions } from "@medusajs/framework/utils"
import { evaluatePromotion } from "./rule-evaluator"
import { buildEnrichedCart, loadConfigShape } from "./cart-enricher"

export async function validateCartPromotions(input: any, cart: any, container: MedusaContainer): Promise<void> {
  if (input.action !== PromotionActions.ADD) return
  if (!input.promo_codes?.length) return

  const query = container.resolve("query")

  for (const code of input.promo_codes) {
    const { data: promotions } = await query.graph({
      entity: "promotion",
      fields: ["id", "code"],
      filters: { code },
    })

    const promotion = promotions[0]
    if (!promotion) continue

    const configShape = await loadConfigShape(promotion.id, container)
    if (!configShape) continue

    const enrichedCart = await buildEnrichedCart(
      (cart as any).id,
      promotion.id,
      configShape,
      container
    )

    const passes = evaluatePromotion(configShape, enrichedCart)

    if (!passes) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Promotion "${code}" conditions are not met for this cart.`
      )
    }
  }
}
