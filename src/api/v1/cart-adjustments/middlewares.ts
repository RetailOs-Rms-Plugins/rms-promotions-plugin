import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import type { MiddlewareRoute } from "@medusajs/framework/http"
import {
  authenticate as rmsAuthenticate,
  rbac,
} from "@retailos-ai/rms-access/middlewares/index"
import * as QueryConfig from "../../admin/cart-adjustments/query-config"
import {
  AdminCreateCartExtAdjustmentSchema,
  AdminGetCartExtAdjustmentSchema,
  AdminGetCartExtAdjustmentsSchema,
} from "../../admin/cart-adjustments/validators"
import { RbacModules } from "../../../types/rbac"

export const v1CartAdjustmentRouteMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/v1/cart-adjustments*",
    middlewares: [rmsAuthenticate("user", ["api-key", "bearer", "session"])],
  },
  {
    matcher: "/v1/cart-adjustments/:cart_id",
    method: ["GET"],
    middlewares: [
      validateAndTransformQuery(
        AdminGetCartExtAdjustmentsSchema,
        QueryConfig.listTransformQueryConfig
      ),
      rbac.read(RbacModules.CartAdjustment.CartAdjustment),
    ],
  },
  {
    matcher: "/v1/cart-adjustments/:cart_id",
    method: ["POST"],
    middlewares: [
      validateAndTransformBody(AdminCreateCartExtAdjustmentSchema),
      validateAndTransformQuery(
        AdminGetCartExtAdjustmentSchema,
        QueryConfig.retrieveTransformQueryConfig
      ),
      rbac.create(RbacModules.CartAdjustment.CartAdjustment),
    ],
  },
  {
    matcher: "/v1/cart-adjustments/:cart_id/:id",
    method: ["DELETE"],
    middlewares: [
      rbac.remove(RbacModules.CartAdjustment.CartAdjustment),
    ],
  },
]
