import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { defineMiddlewares } from "@medusajs/medusa"
import * as QueryConfig from "./query-config"
import {
  AdminBatchCreateCartExtAdjustmentsSchema,
  AdminBatchDeleteCartExtAdjustmentsSchema,
  AdminBatchUpdateCartExtAdjustmentsSchema,
  AdminCreateCartExtAdjustmentSchema,
  AdminGetCartExtAdjustmentSchema,
  AdminGetCartExtAdjustmentsSchema,
  AdminUpdateCartExtAdjustmentSchema,
} from "./validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/cart-adjustments/:cart_id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetCartExtAdjustmentsSchema,
          QueryConfig.listTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/cart-adjustments/:cart_id",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreateCartExtAdjustmentSchema),
        validateAndTransformQuery(
          AdminGetCartExtAdjustmentSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/cart-adjustments/:cart_id/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetCartExtAdjustmentSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/cart-adjustments/:cart_id/:id",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdateCartExtAdjustmentSchema),
        validateAndTransformQuery(
          AdminGetCartExtAdjustmentSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/cart-adjustments/:cart_id/:id",
      method: ["DELETE"],
      middlewares: [],
    },
    {
      matcher: "/admin/cart-adjustments/:cart_id/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminBatchCreateCartExtAdjustmentsSchema),
        validateAndTransformQuery(
          AdminGetCartExtAdjustmentSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/cart-adjustments/:cart_id/batch",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminBatchUpdateCartExtAdjustmentsSchema),
        validateAndTransformQuery(
          AdminGetCartExtAdjustmentSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/cart-adjustments/:cart_id/batch",
      method: ["DELETE"],
      middlewares: [validateAndTransformBody(AdminBatchDeleteCartExtAdjustmentsSchema)],
    },
  ],
})
