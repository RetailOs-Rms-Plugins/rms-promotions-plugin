import { validateAndTransformBody } from "@medusajs/framework/http"
import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { defineMiddlewares } from "@medusajs/medusa"
import { AdminAddCustomItemToOrderEditSchema } from "./[id]/custom-items/validators"
import { recalcOrderEditPromotions } from "../../../lib/recalc-order-edit-promotions"

/**
 * Layer 4 — Order Edit Gate. Reprices the order's promotions before Medusa
 * applies the edit, which is the last moment that can change what the confirm
 * writes. Errors are not swallowed: a failed confirm moves no money, a confirm
 * that records the wrong discount does.
 *
 * @see ADR-0011
 */
const recalcPromotionsBeforeConfirm = async (
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  await recalcOrderEditPromotions(req.params.id, req.scope)
  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/order-edits/:id/custom-items",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminAddCustomItemToOrderEditSchema)],
    },
    {
      matcher: "/admin/order-edits/:id/confirm",
      method: ["POST"],
      middlewares: [recalcPromotionsBeforeConfirm],
    },
  ],
})
