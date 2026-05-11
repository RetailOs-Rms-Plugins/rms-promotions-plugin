import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RMS_RULE_MODEL } from "../../../modules/rms-promotion-rules/constants"
import { RmsRuleHttpTypes } from "../../../types"
import { createRmsRulesWorkflow } from "../../../workflows/rms-rules"

export const GET = async (
  req: AuthenticatedMedusaRequest<RmsRuleHttpTypes.AdminGetRmsRuleParams>,
  res: MedusaResponse<RmsRuleHttpTypes.AdminRmsRuleListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: rms_rules,
    metadata: { count, take, skip } = {},
  } = await query.graph({
    entity: RMS_RULE_MODEL,
    ...req.queryConfig,
    filters: req.filterableFields ?? {},
  })

  res.status(200).json({
    rms_rules,
    count: count ?? 0,
    offset: skip ?? 0,
    limit: take ?? 0,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<RmsRuleHttpTypes.AdminCreateRmsRulePayload>,
  res: MedusaResponse<RmsRuleHttpTypes.AdminRmsRuleResponse>
) => {
  const { result } = await createRmsRulesWorkflow(req.scope).run({
    input: { items: [req.validatedBody] },
  })
  const created = result[0]

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_rule],
  } = await query.graph({
    entity: RMS_RULE_MODEL,
    ...req.queryConfig,
    filters: { id: created.id },
  })

  res.status(201).json({ rms_rule })
}
