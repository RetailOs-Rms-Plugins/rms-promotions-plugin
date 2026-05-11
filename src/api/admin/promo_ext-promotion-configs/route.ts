import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RMS_PROMOTION_CONFIG_MODEL } from "../../../modules/rms-promotion-rules/constants"
import { HttpTypes } from "../../../types"
import { createRmsPromotionConfigsWorkflow } from "../../../workflows/rms-promotion-configs"

export const GET = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminGetRmsPromotionConfigParams>,
  res: MedusaResponse<HttpTypes.AdminRmsPromotionConfigListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { q, ...restFilters } = req.filterableFields ?? {}

  const filters = {
    ...restFilters,
    ...(q
      ? { $or: [{ promotion_id: { $ilike: `%${q}%` } }] }
      : {}),
  }

  const {
    data: rms_promotion_configs,
    metadata: { count, take, skip } = {},
  } = await query.graph({
    entity: RMS_PROMOTION_CONFIG_MODEL,
    ...req.queryConfig,
    filters,
  })

  res.status(200).json({
    rms_promotion_configs,
    count: count ?? 0,
    offset: skip ?? 0,
    limit: take ?? 0,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateRmsPromotionConfigPayload>,
  res: MedusaResponse<HttpTypes.AdminRmsPromotionConfigResponse>
) => {
  const { result } = await createRmsPromotionConfigsWorkflow(req.scope).run({
    input: { items: [req.validatedBody] },
  })
  const created = result[0]

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_promotion_config],
  } = await query.graph({
    entity: RMS_PROMOTION_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id: created.id },
  })

  res.status(201).json({ rms_promotion_config })
}
