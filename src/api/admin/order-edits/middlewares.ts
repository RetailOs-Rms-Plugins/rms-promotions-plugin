import { validateAndTransformBody } from "@medusajs/framework/http"
import { defineMiddlewares } from "@medusajs/medusa"
import { AdminAddCustomItemToOrderEditSchema } from "./[id]/custom-items/validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/order-edits/:id/custom-items",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminAddCustomItemToOrderEditSchema)],
    },
  ],
})
