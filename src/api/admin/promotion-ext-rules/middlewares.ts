import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { defineMiddlewares } from "@medusajs/medusa"
import * as QueryConfig from "./query-config"
import {
  AdminBatchDeletePromotionExtRulesSchema,
  AdminCreatePromotionExtRuleSchema,
  AdminCreatePromotionExtRulesWorkflowInputSchema,
  AdminGetPromotionExtRuleSchema,
  AdminGetPromotionExtRulesSchema,
  AdminUpdatePromotionExtRuleSchema,
  AdminUpdatePromotionExtRulesWorkflowInputSchema,
} from "./validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/promotion-ext-rules",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionExtRulesSchema,
          QueryConfig.listTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rules",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreatePromotionExtRuleSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rules/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionExtRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rules/:id",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdatePromotionExtRuleSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rules/:id",
      method: ["DELETE"],
      middlewares: [],
    },
    {
      matcher: "/admin/promotion-ext-rules/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreatePromotionExtRulesWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rules/batch",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdatePromotionExtRulesWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rules/batch",
      method: ["DELETE"],
      middlewares: [validateAndTransformBody(AdminBatchDeletePromotionExtRulesSchema)],
    },
  ],
})
