import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  AdminCreatePromotionExtRuleGroupPayload,
  AdminGetPromotionExtRuleGroupParams,
  AdminPromotionExtRuleGroupListResponse,
  AdminPromotionExtRuleGroupResponse,
} from "../../../types"
import {
  createPromotionExtRuleGroupsWorkflow,
} from "../../../workflows/promotion-ext"
import { PROMOTION_EXT_RULE_GROUP_MODEL } from "../../../modules/promotion_ext/constants"

export const GET = async (
  req: MedusaRequest<AdminGetPromotionExtRuleGroupParams>,
  res: MedusaResponse<AdminPromotionExtRuleGroupListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { promotion_config_id, type, id, ...restFilters } = req.filterableFields ?? {}

  const filters: Record<string, unknown> = { ...restFilters }
  if (id) filters.id = id
  if (promotion_config_id) filters.promotion_config_id = promotion_config_id
  if (type) filters.type = type

  const {
    data,
    metadata: { count, take, skip } = {} as any,
  } = await query.graph({
    entity: PROMOTION_EXT_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters,
  })

  res.status(200).json({
    promotion_ext_rule_groups: data as never,
    count,
    offset: skip,
    limit: take,
  })
}

export const POST = async (
  req: MedusaRequest<AdminCreatePromotionExtRuleGroupPayload>,
  res: MedusaResponse<AdminPromotionExtRuleGroupResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await createPromotionExtRuleGroupsWorkflow(req.scope).run({
    input: { items: [req.validatedBody] },
  })

  const {
    data: [promotion_ext_rule_group],
  } = await query.graph({
    entity: PROMOTION_EXT_RULE_GROUP_MODEL,
    ...req.queryConfig,
    filters: { id: (result as { id: string }[])[0].id },
  })

  res.status(201).json({ promotion_ext_rule_group: promotion_ext_rule_group as never })
}
