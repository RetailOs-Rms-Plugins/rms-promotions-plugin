/**
 * Override for POST/DELETE /store/carts/:id/line-items/:line_id.
 *
 * Same pattern as the add-item route: run the workflow, then evaluate
 * auto-apply promotions and compute non-standard adjustments AFTER
 * the lock is released.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateLineItemInCartWorkflowId, deleteLineItemsWorkflowId } from "@medusajs/core-flows"
import { Modules } from "@medusajs/framework/utils"
import { evaluateAutoApplyPromotions } from "../../../../../../lib/evaluate-auto-apply-promotions"
import { computeNonStandardAdjustments } from "../../../../../../lib/compute-non-standard-adjustments"
import { refetchCart } from "../../../helpers"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)

  await we.run(updateLineItemInCartWorkflowId, {
    input: {
      cart_id: req.params.id,
      item_id: req.params.line_id,
      update: req.validatedBody,
      additional_data: (req.validatedBody as any).additional_data,
    },
  })

  await evaluateAutoApplyPromotions(req.params.id, req.scope)
  await computeNonStandardAdjustments(req.params.id, req.scope)

  const cart = await refetchCart(req.params.id, req.scope, (req as any).queryConfig.fields)
  res.status(200).json({ cart })
}

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = req.params.line_id
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)

  await we.run(deleteLineItemsWorkflowId, {
    input: {
      cart_id: req.params.id,
      ids: [id],
    },
  })

  await evaluateAutoApplyPromotions(req.params.id, req.scope)
  await computeNonStandardAdjustments(req.params.id, req.scope)

  const cart = await refetchCart(req.params.id, req.scope, (req as any).queryConfig.fields)
  res.status(200).json({
    id,
    object: "line-item",
    deleted: true,
    parent: cart,
  })
}
