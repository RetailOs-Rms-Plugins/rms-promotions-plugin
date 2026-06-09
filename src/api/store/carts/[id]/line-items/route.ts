/**
 * Override for POST /store/carts/:id/line-items (add item to cart).
 *
 * Promotion logic (auto-apply evaluation + non-standard adjustments) runs
 * inside the beforeRefreshingPaymentCollection hook, within the workflow's
 * distributed lock. The route handler just runs the workflow and returns.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addToCartWorkflowId } from "@medusajs/core-flows"
import { Modules } from "@medusajs/framework/utils"
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

  const cart = await refetchCart(req.params.id, req.scope, (req as any).queryConfig.fields)
  res.status(200).json({ cart })
}
