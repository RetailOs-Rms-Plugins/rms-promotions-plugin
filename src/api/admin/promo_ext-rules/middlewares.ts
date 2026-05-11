import {
  defineMiddlewares,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  CreateRmsRuleDTOSchema,
  AdminGetRmsRulesSchema,
  AdminGetRmsRuleSchema,
  AdminUpdateRmsRuleSchema,
  UpdateRmsRuleWorkflowInputSchema,
  DeleteRmsRulesWorkflowInputSchema,
  CreateRmsRuleWorkflowInputSchema,
} from "./validators"
import * as QueryConfig from "./query-config"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/rms-rules",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetRmsRulesSchema,
          QueryConfig.listTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rules",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(CreateRmsRuleDTOSchema),
        validateAndTransformQuery(
          AdminGetRmsRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rules/:id",
      method: ["GET"],
      middlewares: [
        validateAndTransformQuery(
          AdminGetRmsRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rules/:id",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(AdminUpdateRmsRuleSchema),
        validateAndTransformQuery(
          AdminGetRmsRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rules/batch",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(CreateRmsRuleWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetRmsRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rules/batch",
      method: ["PATCH"],
      middlewares: [
        validateAndTransformBody(UpdateRmsRuleWorkflowInputSchema),
        validateAndTransformQuery(
          AdminGetRmsRuleSchema,
          QueryConfig.retrieveTransformQueryConfig
        ),
      ],
    },
    {
      matcher: "/admin/rms-rules/batch",
      method: ["DELETE"],
      middlewares: [
        validateAndTransformBody(DeleteRmsRulesWorkflowInputSchema),
      ],
    },
  ],
})
