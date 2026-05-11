import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { RMS_RULE_MODEL } from "../../../../modules/rms-promotion-rules/constants"
import { RmsRuleHttpTypes } from "../../../../types"
import {
  updateRmsRulesWorkflow,
  deleteRmsRulesWorkflow,
} from "../../../../workflows/rms-rules"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<RmsRuleHttpTypes.AdminRmsRuleResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_rule],
  } = await query.graph({
    entity: RMS_RULE_MODEL,
    ...req.queryConfig,
    filters: { id },
  })

  if (!rms_rule) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `RMS Rule with id "${id}" not found`
    )
  }

  res.status(200).json({ rms_rule })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<RmsRuleHttpTypes.AdminUpdateRmsRulePayload>,
  res: MedusaResponse<RmsRuleHttpTypes.AdminRmsRuleResponse>
) => {
  const { id } = req.params

  const { result } = await updateRmsRulesWorkflow(req.scope).run({
    input: { items: [{ id, ...req.validatedBody }] },
  })
  const updated = result[0]

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_rule],
  } = await query.graph({
    entity: RMS_RULE_MODEL,
    ...req.queryConfig,
    filters: { id: updated.id },
  })

  res.status(200).json({ rms_rule })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<RmsRuleHttpTypes.AdminRmsRuleDeleteResponse>
) => {
  const { id } = req.params

  await deleteRmsRulesWorkflow(req.scope).run({ input: { ids: [id] } })

  res.status(200).json({ id, object: "rms_rule", deleted: true })
}
