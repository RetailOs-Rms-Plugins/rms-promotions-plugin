import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { evaluatePromotion } from "../lib/rule-evaluator"
import { buildEnrichedCart, loadConfigShape } from "../lib/cart-enricher"
import { PROMOTION_EXT_MODULE } from "../modules/promotion-ext"
import type PromotionExtModuleService from "../modules/promotion-ext/service"

const LOG = "[Layer3/validate-checkout]"

// Layer 3 — Checkout Gate
completeCartWorkflow.hooks.validate(
  async ({ cart }, { container }) => {
    console.log(`${LOG} hook fired for cart ${(cart as any).id}`)

    const cartId = (cart as any).id

    // --- Validate promotions (existing) ---
    const appliedPromotions: any[] = (cart as any).promotions ?? []
    console.log(`${LOG} applied promotions on cart: ${appliedPromotions.length}`, appliedPromotions.map(p => ({ id: p.id, code: p.code })))

    if (appliedPromotions.length) {
      for (const promotion of appliedPromotions) {
        console.log(`${LOG} checking promotion "${promotion.code}" (${promotion.id})`)

        const configShape = await loadConfigShape(promotion.id, container)
        console.log(`${LOG} configShape:`, JSON.stringify(configShape))

        if (!configShape) {
          console.log(`${LOG} no ext config — skipping (no custom rules)`)
          continue
        }

        const enrichedCart = await buildEnrichedCart(cartId, promotion.id, configShape, container)
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
    }

    // --- Validate custom adjustments (new — #24) ---
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
          console.log(`${LOG} custom adjustment "${code}" missing from cart — blocking checkout`)
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            "Cart adjustments are out of sync. Please refresh your cart and try again."
          )
        }
      }

      console.log(`${LOG} all ${cartExtAdjustments.length} custom adjustment(s) verified`)
    }

    console.log(`${LOG} checkout allowed`)
  }
)
