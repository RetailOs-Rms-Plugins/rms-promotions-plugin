/**
 * Synchronous promotion hook for refreshCartItemsWorkflow.
 *
 * This hook runs inside refreshCartItemsWorkflow.beforeRefreshingPaymentCollection,
 * which fires AFTER updateCartPromotionsWorkflow applies native adjustments but
 * BEFORE the route handler calls refetchCart(). It computes non-standard
 * adjustments (bundle, buyget_repeat) for promotions already on the cart.
 *
 * ## What this hook does NOT do
 *
 * It does NOT evaluate auto-apply promotions. Auto-apply requires calling
 * updateCartPromotionsWorkflow to add/remove promos, which would deadlock
 * inside a hook — hooks call .run() (standalone invocation) not .runAsStep()
 * (sub-workflow), so the lock is NOT skipped. See ADR-0002 for details.
 *
 * Auto-apply evaluation happens in the custom store route overrides
 * (src/api/store/carts/[id]/line-items/) which run it AFTER the main
 * workflow completes and the lock is released.
 */

import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows"
import { computeNonStandardAdjustments } from "../lib/compute-non-standard-adjustments"

refreshCartItemsWorkflow.hooks.beforeRefreshingPaymentCollection(
  async ({ input }, { container }) => {
    const cartId = (input as any).cart_id
    if (!cartId) return

    await computeNonStandardAdjustments(cartId, container, { insideHook: true })
  }
)
