import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { validateCheckout } from "../lib/validate-checkout"

// Layer 3 — Checkout Gate
completeCartWorkflow.hooks.validate(
  async ({ cart }, { container }) => {
    await validateCheckout(cart, container)
  }
)
