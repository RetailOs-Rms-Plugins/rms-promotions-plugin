import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RMS_RULE_GROUP_MODEL } from "../../../../modules/rms-promotion-rules/constants"
import { RmsRuleGroupHttpTypes } from "../../../../types"
import {
  createRmsRuleGroupsWorkflow,
  updateRmsRuleGroupsWorkflow,
  deleteRmsRuleGroupsWorkflow,
} from "../../../../workflows/rms-rule-groups"

export const POST = async (
  req: AuthenticatedMedusaRequest<RmsRuleGroupHttpTypes.AdminBatchCreateRmsRuleGroupPayload>,
  res: MedusaResponse<RmsRuleGroupHttpTypes.AdminRmsRuleGroupsBatchResponse>
) => {
  const { result } = await createRmsRuleGroupsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = result.map((item) => item.id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rms_rule_groups } = await query.graph({
    entity: RMS_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(201).json({ rms_rule_groups })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<RmsRuleGroupHttpTypes.AdminBatchUpdateRmsRuleGroupPayload>,
  res: MedusaResponse<RmsRuleGroupHttpTypes.AdminRmsRuleGroupsBatchResponse>
) => {
  const { result } = await updateRmsRuleGroupsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = result.map((item) => item.id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rms_rule_groups } = await query.graph({
    entity: RMS_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(200).json({ rms_rule_groups })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest<RmsRuleGroupHttpTypes.AdminBatchDeleteRmsRuleGroupPayload>,
  res: MedusaResponse<RmsRuleGroupHttpTypes.AdminRmsRuleGroupsBatchDeleteResponse>
) => {
  const { ids } = req.validatedBody

  await deleteRmsRuleGroupsWorkflow(req.scope).run({ input: { ids } })

  res.status(200).json({ ids, deleted: true })
}
