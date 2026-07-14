import { updateCartPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { validateCartPromotions } from "../lib/validate-cart-promotions"

// Layer 1 — Code Gate
updateCartPromotionsWorkflow.hooks.validate(
  async ({ input, cart }, { container }) => {
    await validateCartPromotions(input, cart, container)
  }
)
