/**
 * Synchronous promotion hook for refreshCartItemsWorkflow.
 *
 * This hook runs inside refreshCartItemsWorkflow.beforeRefreshingPaymentCollection,
 * which fires AFTER updateCartPromotionsWorkflow applies native adjustments but
 * BEFORE the route handler calls refetchCart(). It is the single invocation
 * point for all plugin promotion logic:
 *
 * 1. Evaluate auto-apply promotions (add/remove via direct link manipulation)
 * 2. Compute non-standard adjustments (bundle, buyget_repeat)
 *
 * All logic runs inside the workflow's distributed lock — no concurrent
 * writers, no interleaving, no race conditions.
 */

import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows"
import { evaluateAutoApplyPromotions } from "../lib/evaluate-auto-apply-promotions"
import { computeNonStandardAdjustments } from "../lib/compute-non-standard-adjustments"

refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection(
  async ({ input }, { container }) => {
    const cartId = (input as any).cart_id
    if (!cartId) return

    const { added } = await evaluateAutoApplyPromotions(cartId, container)
    await computeNonStandardAdjustments(cartId, container, { freshlyLinkedCodes: added })
  }
)
