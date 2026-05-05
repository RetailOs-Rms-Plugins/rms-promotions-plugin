import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import {
  PostAdminCreateThresholdPromotion,
  PostAdminUpdateThresholdPromotion,
} from "./admin/threshold-promotions/validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/threshold-promotions",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminCreateThresholdPromotion)],
    },
    {
      matcher: "/admin/threshold-promotions/:id",
      method: "POST",
      middlewares: [validateAndTransformBody(PostAdminUpdateThresholdPromotion)],
    },
  ],
})
