import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows"
import { computeNonStandardAdjustments } from "../lib/compute-non-standard-adjustments"

refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection(
  async ({ input }, { container }) => {
    const cartId = (input as any).cart_id
    if (!cartId) return

    await computeNonStandardAdjustments(cartId, container)
  }
)
