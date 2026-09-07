import { validateAndTransformBody } from "@medusajs/framework/http"
import { defineMiddlewares } from "@medusajs/medusa"
import { AdminRepairOrderAdjustmentsSchema } from "./validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/order-adjustment-repair/:id",
      method: ["POST"],
      middlewares: [validateAndTransformBody(AdminRepairOrderAdjustmentsSchema)],
    },
  ],
})
