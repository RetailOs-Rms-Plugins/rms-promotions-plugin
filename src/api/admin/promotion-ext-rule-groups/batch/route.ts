import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  AdminBatchCreatePromotionExtRuleGroupPayload,
  AdminBatchDeletePromotionExtRuleGroupPayload,
  AdminBatchUpdatePromotionExtRuleGroupPayload,
  AdminPromotionExtRuleGroupsBatchDeleteResponse,
  AdminPromotionExtRuleGroupsBatchResponse,
} from "../../../../types"
import {
  createPromotionExtRuleGroupsWorkflow,
  deletePromotionExtRuleGroupsWorkflow,
  updatePromotionExtRuleGroupsWorkflow,
} from "../../../../workflows/promotion-ext"
import { PROMOTION_EXT_RULE_GROUP_MODEL } from "../../../../modules/promotion-ext/constants"

export const POST = async (
  req: MedusaRequest<AdminBatchCreatePromotionExtRuleGroupPayload>,
  res: MedusaResponse<AdminPromotionExtRuleGroupsBatchResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await createPromotionExtRuleGroupsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = (result as { id: string }[]).map((g) => g.id)

  const { data: promotion_ext_rule_groups } = await query.graph({
    entity: PROMOTION_EXT_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(201).json({ promotion_ext_rule_groups: promotion_ext_rule_groups as never })
}

export const PATCH = async (
  req: MedusaRequest<AdminBatchUpdatePromotionExtRuleGroupPayload>,
  res: MedusaResponse<AdminPromotionExtRuleGroupsBatchResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await updatePromotionExtRuleGroupsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = (result as { id: string }[]).map((g) => g.id)

  const { data: promotion_ext_rule_groups } = await query.graph({
    entity: PROMOTION_EXT_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(200).json({ promotion_ext_rule_groups: promotion_ext_rule_groups as never })
}

export const DELETE = async (
  req: MedusaRequest<AdminBatchDeletePromotionExtRuleGroupPayload>,
  res: MedusaResponse<AdminPromotionExtRuleGroupsBatchDeleteResponse>
) => {
  const { ids } = req.validatedBody

  await deletePromotionExtRuleGroupsWorkflow(req.scope).run({ input: { ids } })

  res.status(200).json({ ids, deleted: true })
}
