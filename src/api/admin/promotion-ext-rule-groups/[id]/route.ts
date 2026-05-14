import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  AdminPromotionExtRuleGroupDeleteResponse,
  AdminPromotionExtRuleGroupResponse,
  AdminUpdatePromotionExtRuleGroupPayload,
} from "../../../../types"
import {
  deletePromotionExtRuleGroupsWorkflow,
  updatePromotionExtRuleGroupsWorkflow,
} from "../../../../workflows/promotion-ext"
import { PROMOTION_EXT_RULE_GROUP_MODEL } from "../../../../modules/promotion-ext/constants"

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<AdminPromotionExtRuleGroupResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [promotion_ext_rule_group],
  } = await query.graph({
    entity: PROMOTION_EXT_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id },
  })

  if (!promotion_ext_rule_group) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Promotion ext rule group with id "${id}" not found`
    )
  }

  res.status(200).json({ promotion_ext_rule_group: promotion_ext_rule_group as never })
}

export const PATCH = async (
  req: MedusaRequest<AdminUpdatePromotionExtRuleGroupPayload>,
  res: MedusaResponse<AdminPromotionExtRuleGroupResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await updatePromotionExtRuleGroupsWorkflow(req.scope).run({
    input: { items: [{ id, ...req.validatedBody }] },
  })

  const {
    data: [promotion_ext_rule_group],
  } = await query.graph({
    entity: PROMOTION_EXT_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id: (result as { id: string }[])[0].id },
  })

  res.status(200).json({ promotion_ext_rule_group: promotion_ext_rule_group as never })
}

export const DELETE = async (
  req: MedusaRequest,
  res: MedusaResponse<AdminPromotionExtRuleGroupDeleteResponse>
) => {
  const { id } = req.params

  await deletePromotionExtRuleGroupsWorkflow(req.scope).run({
    input: { ids: [id] },
  })

  res.status(200).json({ id, object: "promotion_ext_rule_group", deleted: true })
}
