import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  AdminBatchCreatePromotionExtRulePayload,
  AdminBatchDeletePromotionExtRulePayload,
  AdminBatchUpdatePromotionExtRulePayload,
  AdminPromotionExtRulesBatchDeleteResponse,
  AdminPromotionExtRulesBatchResponse,
} from "../../../../types"
import {
  createPromotionExtRulesWorkflow,
  deletePromotionExtRulesWorkflow,
  updatePromotionExtRulesWorkflow,
} from "../../../../workflows/promotion-ext"
import { PROMOTION_EXT_RULE_MODEL } from "../../../../modules/promotion_ext/constants"

export const POST = async (
  req: MedusaRequest<AdminBatchCreatePromotionExtRulePayload>,
  res: MedusaResponse<AdminPromotionExtRulesBatchResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await createPromotionExtRulesWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = (result as { id: string }[]).map((r) => r.id)

  const { data: promotion_ext_rules } = await query.graph({
    entity: PROMOTION_EXT_RULE_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(201).json({ promotion_ext_rules: promotion_ext_rules as never })
}

export const PATCH = async (
  req: MedusaRequest<AdminBatchUpdatePromotionExtRulePayload>,
  res: MedusaResponse<AdminPromotionExtRulesBatchResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await updatePromotionExtRulesWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = (result as { id: string }[]).map((r) => r.id)

  const { data: promotion_ext_rules } = await query.graph({
    entity: PROMOTION_EXT_RULE_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(200).json({ promotion_ext_rules: promotion_ext_rules as never })
}

export const DELETE = async (
  req: MedusaRequest<AdminBatchDeletePromotionExtRulePayload>,
  res: MedusaResponse<AdminPromotionExtRulesBatchDeleteResponse>
) => {
  const { ids } = req.validatedBody

  await deletePromotionExtRulesWorkflow(req.scope).run({ input: { ids } })

  res.status(200).json({ ids, deleted: true })
}
