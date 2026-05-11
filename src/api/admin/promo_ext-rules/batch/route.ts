import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RMS_RULE_MODEL } from "../../../../modules/rms-promotion-rules/constants"
import { RmsRuleHttpTypes } from "../../../../types"
import {
  createRmsRulesWorkflow,
  updateRmsRulesWorkflow,
  deleteRmsRulesWorkflow,
} from "../../../../workflows/rms-rules"

export const POST = async (
  req: AuthenticatedMedusaRequest<RmsRuleHttpTypes.AdminBatchCreateRmsRulePayload>,
  res: MedusaResponse<RmsRuleHttpTypes.AdminRmsRulesBatchResponse>
) => {
  const { result } = await createRmsRulesWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = result.map((item) => item.id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rms_rules } = await query.graph({
    entity: RMS_RULE_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(201).json({ rms_rules })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<RmsRuleHttpTypes.AdminBatchUpdateRmsRulePayload>,
  res: MedusaResponse<RmsRuleHttpTypes.AdminRmsRulesBatchResponse>
) => {
  const { result } = await updateRmsRulesWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = result.map((item) => item.id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rms_rules } = await query.graph({
    entity: RMS_RULE_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(200).json({ rms_rules })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest<RmsRuleHttpTypes.AdminBatchDeleteRmsRulePayload>,
  res: MedusaResponse<RmsRuleHttpTypes.AdminRmsRulesBatchDeleteResponse>
) => {
  const { ids } = req.validatedBody

  await deleteRmsRulesWorkflow(req.scope).run({ input: { ids } })

  res.status(200).json({ ids, deleted: true })
}
