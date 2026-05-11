import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  AdminCreatePromotionExtConfigPayload,
  AdminGetPromotionExtConfigParams,
  AdminPromotionExtConfigListResponse,
  AdminPromotionExtConfigResponse,
} from "../../../types"
import {
  createPromotionExtConfigsWorkflow,
} from "../../../workflows/promotion-ext"
import { PROMOTION_EXT_CONFIG_MODEL } from "../../../modules/promotion_ext/constants"

export const GET = async (
  req: MedusaRequest<AdminGetPromotionExtConfigParams>,
  res: MedusaResponse<AdminPromotionExtConfigListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { promotion_id, auto_apply, id, ...restFilters } = req.filterableFields ?? {}

  const filters: Record<string, unknown> = { ...restFilters }
  if (id) filters.id = id
  if (promotion_id) filters.promotion_id = promotion_id
  if (auto_apply !== undefined) filters.auto_apply = auto_apply

  const {
    data,
    metadata: { count, take, skip } = {} as any,
  } = await query.graph({
    entity: PROMOTION_EXT_CONFIG_MODEL,
    ...req.queryConfig,
    filters,
  })

  res.status(200).json({
    promotion_ext_configs: data as never,
    count,
    offset: skip,
    limit: take,
  })
}

export const POST = async (
  req: MedusaRequest<AdminCreatePromotionExtConfigPayload>,
  res: MedusaResponse<AdminPromotionExtConfigResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const existing = await query.graph({
    entity: PROMOTION_EXT_CONFIG_MODEL,
    fields: ["id"],
    filters: { promotion_id: req.validatedBody.promotion_id },
  })

  if (existing.data.length > 0) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `A config already exists for promotion_id "${req.validatedBody.promotion_id}"`
    )
  }

  const { result } = await createPromotionExtConfigsWorkflow(req.scope).run({
    input: { items: [req.validatedBody] },
  })

  const {
    data: [promotion_ext_config],
  } = await query.graph({
    entity: PROMOTION_EXT_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id: (result as { id: string }[])[0].id },
  })

  res.status(201).json({ promotion_ext_config: promotion_ext_config as never })
}
