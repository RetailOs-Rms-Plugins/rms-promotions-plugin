import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { RMS_PROMOTION_CONFIG_MODEL } from "../../../../modules/rms-promotion-rules/constants"
import { HttpTypes } from "../../../../types"
import {
  createRmsPromotionConfigsWorkflow,
  updateRmsPromotionConfigsWorkflow,
  deleteRmsPromotionConfigsWorkflow,
} from "../../../../workflows/rms-promotion-configs"

export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminBatchCreateRmsPromotionConfigPayload>,
  res: MedusaResponse<HttpTypes.AdminRmsPromotionConfigsBatchResponse>
) => {
  const { result } = await createRmsPromotionConfigsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = result.map((item) => item.id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rms_promotion_configs } = await query.graph({
    entity: RMS_PROMOTION_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(201).json({ rms_promotion_configs })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminBatchUpdateRmsPromotionConfigPayload>,
  res: MedusaResponse<HttpTypes.AdminRmsPromotionConfigsBatchResponse>
) => {
  const { result } = await updateRmsPromotionConfigsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = result.map((item) => item.id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: rms_promotion_configs } = await query.graph({
    entity: RMS_PROMOTION_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(200).json({ rms_promotion_configs })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminBatchDeleteRmsPromotionConfigPayload>,
  res: MedusaResponse<HttpTypes.AdminRmsPromotionConfigsBatchDeleteResponse>
) => {
  const { ids } = req.validatedBody

  await deleteRmsPromotionConfigsWorkflow(req.scope).run({ input: { ids } })

  res.status(200).json({ ids, deleted: true })
}
