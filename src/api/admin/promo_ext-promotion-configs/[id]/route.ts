import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { RMS_PROMOTION_CONFIG_MODEL } from "../../../../modules/rms-promotion-rules/constants"
import { HttpTypes } from "../../../../types"
import {
  updateRmsPromotionConfigsWorkflow,
  deleteRmsPromotionConfigsWorkflow,
} from "../../../../workflows/rms-promotion-configs"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.AdminRmsPromotionConfigResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_promotion_config],
  } = await query.graph({
    entity: RMS_PROMOTION_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id },
  })

  if (!rms_promotion_config) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `RMS Promotion Config with id "${id}" not found`
    )
  }

  res.status(200).json({ rms_promotion_config })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminUpdateRmsPromotionConfigPayload>,
  res: MedusaResponse<HttpTypes.AdminRmsPromotionConfigResponse>
) => {
  const { id } = req.params

  const { result } = await updateRmsPromotionConfigsWorkflow(req.scope).run({
    input: { items: [{ id, ...req.validatedBody }] },
  })
  const updated = result[0]

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [rms_promotion_config],
  } = await query.graph({
    entity: RMS_PROMOTION_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id: updated.id },
  })

  res.status(200).json({ rms_promotion_config })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.AdminRmsPromotionConfigDeleteResponse>
) => {
  const { id } = req.params

  await deleteRmsPromotionConfigsWorkflow(req.scope).run({
    input: { ids: [id] },
  })

  res.status(200).json({ id, object: "rms_promotion_config", deleted: true })
}
