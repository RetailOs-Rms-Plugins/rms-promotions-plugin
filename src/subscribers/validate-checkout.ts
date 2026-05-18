import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { MedusaError } from "@medusajs/framework/utils"
import { evaluatePromotion } from "../lib/rule-evaluator"
import { buildEnrichedCart, loadConfigShape } from "../lib/cart-enricher"

const LOG = "[Layer3/validate-checkout]"

// Layer 3 — Checkout Gate
completeCartWorkflow.hooks.validate(
  async ({ cart }, { container }) => {
    console.log(`${LOG} hook fired for cart ${(cart as any).id}`)

    const appliedPromotions: any[] = (cart as any).promotions ?? []
    console.log(`${LOG} applied promotions on cart: ${appliedPromotions.length}`, appliedPromotions.map(p => ({ id: p.id, code: p.code })))

    if (!appliedPromotions.length) {
      console.log(`${LOG} no promotions on cart — skipping`)
      return
    }

    for (const promotion of appliedPromotions) {
      console.log(`${LOG} checking promotion "${promotion.code}" (${promotion.id})`)

      const configShape = await loadConfigShape(promotion.id, container)
      console.log(`${LOG} configShape:`, JSON.stringify(configShape))

      if (!configShape) {
        console.log(`${LOG} no ext config — skipping (no custom rules)`)
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
        console.log(`${LOG} rules failed — blocking order`)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Promotion "${promotion.code}" conditions are no longer met. Please review your cart before completing the order.`
        )
      }

      console.log(`${LOG} promotion "${promotion.code}" still valid`)
    }

    console.log(`${LOG} all promotions valid — checkout allowed`)
  }
)
