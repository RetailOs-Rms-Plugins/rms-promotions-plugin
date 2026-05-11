import {
  defineMiddlewares,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  CreateRmsRuleGroupDTOSchema,
  AdminGetRmsRuleGroupsSchema,
  AdminGetRmsRuleGroupSchema,
  AdminUpdateRmsRuleGroupSchema,
  UpdateRmsRuleGroupWorkflowInputSchema,
  DeleteRmsRuleGroupsWorkflowInputSchema,
  CreateRmsRuleGroupWorkflowInputSchema,
} from "./validators"
import * as QueryConfig from "./query-config"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/rms-rule-groups",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetRmsRuleGroupsSchema,
          QueryConfig.listTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rule-groups",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(CreateRmsRuleGroupDTOSchema),
        validateAndTransformQuery(
          AdminGetRmsRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rule-groups/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetRmsRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rule-groups/:id",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdateRmsRuleGroupSchema),
        validateAndTransformQuery(
          AdminGetRmsRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rule-groups/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(CreateRmsRuleGroupWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetRmsRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rule-groups/batch",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(UpdateRmsRuleGroupWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetRmsRuleGroupSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rule-groups/batch",
      method: ["DELETE"],
      middlewares: [
        validateAndTransformBody(DeleteRmsRuleGroupsWorkflowInputSchema),
      ],
    },
  ],
})
