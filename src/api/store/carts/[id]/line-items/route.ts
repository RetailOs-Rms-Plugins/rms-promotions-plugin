/**
 * Override for POST /store/carts/:id/line-items (add item to cart).
 *
 * After the addToCartWorkflow completes (and releases its lock), this route
 * evaluates auto-apply promotions and computes non-standard adjustments
 * before returning the response. This ensures the first addItemToCart call
 * on a new cart already includes auto-applied promos and their adjustments.
 *
 * Why not do this in the beforeRefreshingPaymentCollection hook?
 * Hooks call updateCartPromotionsWorkflow via .run() (standalone invocation),
 * not .runAsStep() (sub-workflow). Standalone invocations attempt to acquire
 * the cart lock, which the parent workflow still holds → deadlock.
 * Running AFTER the workflow avoids this because the lock is released.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addToCartWorkflowId } from "@medusajs/core-flows"
import { Modules } from "@medusajs/framework/utils"
import { evaluateAutoApplyPromotions } from "../../../../../lib/evaluate-auto-apply-promotions"
import { computeNonStandardAdjustments } from "../../../../../lib/compute-non-standard-adjustments"
import { refetchCart } from "../../helpers"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)

  await we.run(addToCartWorkflowId, {
    input: {
      cart_id: req.params.id,
      items: [req.validatedBody],
      additional_data: (req.validatedBody as any).additional_data,
    },
  })

  await evaluateAutoApplyPromotions(req.params.id, req.scope)
  await computeNonStandardAdjustments(req.params.id, req.scope)

  const cart = await refetchCart(req.params.id, req.scope, (req as any).queryConfig.fields)
  res.status(200).json({ cart })
}
