import {
  defineMiddlewares,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  CreateRmsPromotionConfigDTOSchema,
  AdminGetRmsPromotionConfigsSchema,
  AdminGetRmsPromotionConfigSchema,
  AdminUpdateRmsPromotionConfigSchema,
  UpdateRmsPromotionConfigWorkflowInputSchema,
  DeleteRmsPromotionConfigsWorkflowInputSchema,
  CreateRmsPromotionConfigWorkflowInputSchema,
} from "./validators"
import * as QueryConfig from "./query-config"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/rms-promotion-configs",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetRmsPromotionConfigsSchema,
          QueryConfig.listTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-promotion-configs",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(CreateRmsPromotionConfigDTOSchema),
        validateAndTransformQuery(
          AdminGetRmsPromotionConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-promotion-configs/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetRmsPromotionConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-promotion-configs/:id",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdateRmsPromotionConfigSchema),
        validateAndTransformQuery(
          AdminGetRmsPromotionConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-promotion-configs/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(CreateRmsPromotionConfigWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetRmsPromotionConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-promotion-configs/batch",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(UpdateRmsPromotionConfigWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetRmsPromotionConfigSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-promotion-configs/batch",
      method: ["DELETE"],
      middlewares: [
        validateAndTransformBody(DeleteRmsPromotionConfigsWorkflowInputSchema),
      ],
    },
  ],
})
