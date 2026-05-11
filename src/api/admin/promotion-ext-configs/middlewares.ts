import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { defineMiddlewares } from "@medusajs/medusa"
import * as QueryConfig from "./query-config"
import {
  AdminBatchDeletePromotionExtConfigsSchema,
  AdminCreatePromotionExtConfigSchema,
  AdminCreatePromotionExtConfigsWorkflowInputSchema,
  AdminGetPromotionExtConfigSchema,
  AdminGetPromotionExtConfigsSchema,
  AdminUpdatePromotionExtConfigSchema,
  AdminUpdatePromotionExtConfigsWorkflowInputSchema,
} from "./validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/promotion-ext-configs",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionExtConfigsSchema,
          QueryConfig.listTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-configs",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreatePromotionExtConfigSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-configs/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionExtConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-configs/:id",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdatePromotionExtConfigSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-configs/:id",
      method: ["DELETE"],
      middlewares: [],
    },
    {
      matcher: "/admin/promotion-ext-configs/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreatePromotionExtConfigsWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-configs/batch",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdatePromotionExtConfigsWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-configs/batch",
      method: ["DELETE"],
      middlewares: [validateAndTransformBody(AdminBatchDeletePromotionExtConfigsSchema)],
    },
  ],
})
