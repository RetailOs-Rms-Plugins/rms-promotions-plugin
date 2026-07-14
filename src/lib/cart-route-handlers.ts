/**
 * Extracted handler logic for cart route overrides.
 *
 * Each function mirrors the original route handler exactly —
 * only the import of `refetchCart` has been relocated.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  addToCartWorkflowId,
  updateLineItemInCartWorkflowId,
  deleteLineItemsWorkflowId,
  updateCartPromotionsWorkflowId,
} from "@medusajs/core-flows"
import { Modules, PromotionActions } from "@medusajs/framework/utils"
import { computeNonStandardAdjustments } from "./compute-non-standard-adjustments"
import { refetchCart } from "./refetch-cart"

export const handleAddLineItem = async (req: MedusaRequest, res: MedusaResponse) => {
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

export const handleUpdateLineItem = async (req: MedusaRequest, res: MedusaResponse) => {
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

export const handleDeleteLineItem = async (req: MedusaRequest, res: MedusaResponse) => {
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

export const handleAddPromotions = async (req: MedusaRequest, res: MedusaResponse) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)
  const payload = req.validatedBody as { promo_codes: string[] }

  await we.run(updateCartPromotionsWorkflowId, {
    input: {
      promo_codes: payload.promo_codes,
      cart_id: req.params.id,
      action: payload.promo_codes.length > 0
        ? PromotionActions.ADD
        : PromotionActions.REPLACE,
      force_refresh_payment_collection: true,
    },
  })

  await computeNonStandardAdjustments(req.params.id, req.scope)

  const cart = await refetchCart(req.params.id, req.scope, (req as any).queryConfig.fields)
  res.status(200).json({ cart })
}

export const handleRemovePromotions = async (req: MedusaRequest, res: MedusaResponse) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)
  const payload = req.validatedBody as { promo_codes: string[] }

  await we.run(updateCartPromotionsWorkflowId, {
    input: {
      promo_codes: payload.promo_codes,
      cart_id: req.params.id,
      action: PromotionActions.REMOVE,
      force_refresh_payment_collection: true,
    },
  })

  await computeNonStandardAdjustments(req.params.id, req.scope)

  const cart = await refetchCart(req.params.id, req.scope, (req as any).queryConfig.fields)
  res.status(200).json({ cart })
}
