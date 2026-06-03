import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateCartPromotionsWorkflowId } from "@medusajs/core-flows"
import { Modules, PromotionActions } from "@medusajs/framework/utils"
import { computeNonStandardAdjustments } from "../../../../../lib/compute-non-standard-adjustments"
import { refetchCart } from "../../helpers"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
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

export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
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
