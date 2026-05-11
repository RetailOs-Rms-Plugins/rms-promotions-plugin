import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RMS_RULE_GROUP_MODEL } from "../../../modules/rms-promotion-rules/constants"
import { RmsRuleGroupHttpTypes } from "../../../types"
import { createRmsRuleGroupsWorkflow } from "../../../workflows/rms-rule-groups"

export const GET = async (
  req: AuthenticatedMedusaRequest<RmsRuleGroupHttpTypes.AdminGetRmsRuleGroupParams>,
  res: MedusaResponse<RmsRuleGroupHttpTypes.AdminRmsRuleGroupListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: rms_rule_groups,
    metadata: { count, take, skip } = {},
  } = await query.graph({
    entity: RMS_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: req.filterableFields ?? {},
  })

  res.status(200).json({
    rms_rule_groups,
    count: count ?? 0,
    offset: skip ?? 0,
    limit: take ?? 0,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<RmsRuleGroupHttpTypes.AdminCreateRmsRuleGroupPayload>,
  res: MedusaResponse<RmsRuleGroupHttpTypes.AdminRmsRuleGroupResponse>
) => {
  const { result } = await createRmsRuleGroupsWorkflow(req.scope).run({
    input: { items: [req.validatedBody] },
  })
  const created = result[0]

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_rule_group],
  } = await query.graph({
    entity: RMS_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id: created.id },
  })

  res.status(201).json({ rms_rule_group })
}
