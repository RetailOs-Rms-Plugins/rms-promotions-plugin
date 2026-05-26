import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { MedusaError, PromotionActions } from "@medusajs/framework/utils"
import { evaluatePromotion } from "../lib/rule-evaluator"
import { buildEnrichedCart, loadConfigShape } from "../lib/cart-enricher"

// Layer 1 — Code Gate
updateCartPromotionsWorkflow.hooks.validate(
  async ({ input, cart }, { container }) => {
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
)
