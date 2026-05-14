import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  AdminPromotionExtRuleDeleteResponse,
  AdminPromotionExtRuleResponse,
  AdminUpdatePromotionExtRulePayload,
} from "../../../../types"
import {
  deletePromotionExtRulesWorkflow,
  updatePromotionExtRulesWorkflow,
} from "../../../../workflows/promotion-ext"
import { PROMOTION_EXT_RULE_MODEL } from "../../../../modules/promotion-ext/constants"

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<AdminPromotionExtRuleResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [promotion_ext_rule],
  } = await query.graph({
    entity: PROMOTION_EXT_RULE_MODEL,
    ...req.queryConfig,
    filters: { id },
  })

  if (!promotion_ext_rule) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Promotion ext rule with id "${id}" not found`
    )
  }

  res.status(200).json({ promotion_ext_rule: promotion_ext_rule as never })
}

export const PATCH = async (
  req: MedusaRequest<AdminUpdatePromotionExtRulePayload>,
  res: MedusaResponse<AdminPromotionExtRuleResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await updatePromotionExtRulesWorkflow(req.scope).run({
    input: { items: [{ id, ...req.validatedBody }] },
  })

  const {
    data: [promotion_ext_rule],
  } = await query.graph({
    entity: PROMOTION_EXT_RULE_MODEL,
    ...req.queryConfig,
    filters: { id: (result as { id: string }[])[0].id },
  })

  res.status(200).json({ promotion_ext_rule: promotion_ext_rule as never })
}

export const DELETE = async (
  req: MedusaRequest,
  res: MedusaResponse<AdminPromotionExtRuleDeleteResponse>
) => {
  const { id } = req.params

  await deletePromotionExtRulesWorkflow(req.scope).run({
    input: { ids: [id] },
  })

  res.status(200).json({ id, object: "promotion_ext_rule", deleted: true })
}
