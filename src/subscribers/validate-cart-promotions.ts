import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { MedusaError, PromotionActions } from "@medusajs/framework/utils"
import { evaluatePromotion } from "../lib/rule-evaluator"
import { buildEnrichedCart, loadConfigShape } from "../lib/cart-enricher"

const LOG = "[Layer1/validate-cart-promotions]"

// Layer 1 — Code Gate
updateCartPromotionsWorkflow.hooks.validate(
  async ({ input, cart }, { container }) => {
    console.log(`${LOG} hook fired — action: ${input.action}, codes: ${JSON.stringify(input.promo_codes)}`)

    if (input.action !== PromotionActions.ADD) {
      console.log(`${LOG} action is not ADD — skipping`)
      return
    }
    if (!input.promo_codes?.length) {
      console.log(`${LOG} no promo_codes — skipping`)
      return
    }

    const query = container.resolve("query")

    for (const code of input.promo_codes) {
      console.log(`${LOG} checking code "${code}"`)

      const { data: promotions } = await query.graph({
        entity: "promotion",
        fields: ["id", "code"],
        filters: { code },
      })

      const promotion = promotions[0]
      console.log(`${LOG} promotion found:`, promotion ? { id: promotion.id, code: promotion.code } : null)

      if (!promotion) {
        console.log(`${LOG} no promotion found for code "${code}" — skipping`)
        continue
      }

      const configShape = await loadConfigShape(promotion.id, container)
      console.log(`${LOG} configShape:`, JSON.stringify(configShape))

      if (!configShape) {
        console.log(`${LOG} no ext config for promotion "${code}" — skipping (no custom rules)`)
        continue
      }

      const enrichedCart = await buildEnrichedCart(
        (cart as any).id,
        promotion.id,
        configShape,
        container
      )
      console.log(`${LOG} enrichedCart:`, JSON.stringify(enrichedCart))

      const passes = evaluatePromotion(configShape, enrichedCart)
      console.log(`${LOG} evaluatePromotion result: ${passes}`)

      if (!passes) {
        console.log(`${LOG} rules failed — throwing 400`)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Promotion "${code}" conditions are not met for this cart.`
        )
      }

      console.log(`${LOG} code "${code}" passed all rules`)
    }
  }
)
