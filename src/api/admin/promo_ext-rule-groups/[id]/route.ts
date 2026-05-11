import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { RMS_RULE_GROUP_MODEL } from "../../../../modules/rms-promotion-rules/constants"
import { RmsRuleGroupHttpTypes } from "../../../../types"
import {
  updateRmsRuleGroupsWorkflow,
  deleteRmsRuleGroupsWorkflow,
} from "../../../../workflows/rms-rule-groups"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<RmsRuleGroupHttpTypes.AdminRmsRuleGroupResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_rule_group],
  } = await query.graph({
    entity: RMS_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id },
  })

  if (!rms_rule_group) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `RMS Rule Group with id "${id}" not found`
    )
  }

  res.status(200).json({ rms_rule_group })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<RmsRuleGroupHttpTypes.AdminUpdateRmsRuleGroupPayload>,
  res: MedusaResponse<RmsRuleGroupHttpTypes.AdminRmsRuleGroupResponse>
) => {
  const { id } = req.params

  const { result } = await updateRmsRuleGroupsWorkflow(req.scope).run({
    input: { items: [{ id, ...req.validatedBody }] },
  })
  const updated = result[0]

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_rule_group],
  } = await query.graph({
    entity: RMS_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id: updated.id },
  })

  res.status(200).json({ rms_rule_group })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<RmsRuleGroupHttpTypes.AdminRmsRuleGroupDeleteResponse>
) => {
  const { id } = req.params

  await deleteRmsRuleGroupsWorkflow(req.scope).run({ input: { ids: [id] } })

  res.status(200).json({ id, object: "rms_rule_group", deleted: true })
}
