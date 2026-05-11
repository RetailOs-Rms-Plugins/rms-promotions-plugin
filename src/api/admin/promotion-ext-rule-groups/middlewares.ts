import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { defineMiddlewares } from "@medusajs/medusa"
import * as QueryConfig from "./query-config"
import {
  AdminBatchDeletePromotionExtRuleGroupsSchema,
  AdminCreatePromotionExtRuleGroupSchema,
  AdminCreatePromotionExtRuleGroupsWorkflowInputSchema,
  AdminGetPromotionExtRuleGroupSchema,
  AdminGetPromotionExtRuleGroupsSchema,
  AdminUpdatePromotionExtRuleGroupSchema,
  AdminUpdatePromotionExtRuleGroupsWorkflowInputSchema,
} from "./validators"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/promotion-ext-rule-groups",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionExtRuleGroupsSchema,
          QueryConfig.listTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rule-groups",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreatePromotionExtRuleGroupSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rule-groups/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetPromotionExtRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rule-groups/:id",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdatePromotionExtRuleGroupSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rule-groups/:id",
      method: ["DELETE"],
      middlewares: [],
    },
    {
      matcher: "/admin/promotion-ext-rule-groups/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreatePromotionExtRuleGroupsWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rule-groups/batch",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdatePromotionExtRuleGroupsWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetPromotionExtRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/promotion-ext-rule-groups/batch",
      method: ["DELETE"],
      middlewares: [validateAndTransformBody(AdminBatchDeletePromotionExtRuleGroupsSchema)],
    },
  ],
})
