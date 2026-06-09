/**
 * Override for POST/DELETE /store/carts/:id/line-items/:line_id.
 *
 * Promotion logic runs inside the beforeRefreshingPaymentCollection hook,
 * within the workflow's distributed lock. Routes just run workflows and return.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateLineItemInCartWorkflowId, deleteLineItemsWorkflowId } from "@medusajs/core-flows"
import { Modules } from "@medusajs/framework/utils"
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

  const cart = await refetchCart(req.params.id, req.scope, (req as any).queryConfig.fields)
  res.status(200).json({
    id,
    object: "line-item",
    deleted: true,
    parent: cart,
  })
}
