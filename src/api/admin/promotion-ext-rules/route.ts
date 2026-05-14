import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  AdminCreatePromotionExtRulePayload,
  AdminGetPromotionExtRuleParams,
  AdminPromotionExtRuleListResponse,
  AdminPromotionExtRuleResponse,
} from "../../../types"
import {
  createPromotionExtRulesWorkflow,
} from "../../../workflows/promotion-ext"
import { PROMOTION_EXT_RULE_MODEL } from "../../../modules/promotion-ext/constants"

export const GET = async (
  req: MedusaRequest<AdminGetPromotionExtRuleParams>,
  res: MedusaResponse<AdminPromotionExtRuleListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { rule_group_id, rule_type, id, ...restFilters } = req.filterableFields ?? {}

  const filters: Record<string, unknown> = { ...restFilters }
  if (id) filters.id = id
  if (rule_group_id) filters.rule_group_id = rule_group_id
  if (rule_type) filters.rule_type = rule_type

  const {
    data,
    metadata: { count, take, skip } = {} as any,
  } = await query.graph({
    entity: PROMOTION_EXT_RULE_MODEL,
    ...req.queryConfig,
    filters,
  })

  res.status(200).json({
    promotion_ext_rules: data as never,
    count,
    offset: skip,
    limit: take,
  })
}

export const POST = async (
  req: MedusaRequest<AdminCreatePromotionExtRulePayload>,
  res: MedusaResponse<AdminPromotionExtRuleResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await createPromotionExtRulesWorkflow(req.scope).run({
    input: { items: [req.validatedBody] },
  })

  const {
    data: [promotion_ext_rule],
  } = await query.graph({
    entity: PROMOTION_EXT_RULE_MODEL,
    ...req.queryConfig,
    filters: { id: (result as { id: string }[])[0].id },
  })

  res.status(201).json({ promotion_ext_rule: promotion_ext_rule as never })
}
