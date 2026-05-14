import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  AdminBatchCreatePromotionExtConfigPayload,
  AdminBatchDeletePromotionExtConfigPayload,
  AdminBatchUpdatePromotionExtConfigPayload,
  AdminPromotionExtConfigsBatchDeleteResponse,
  AdminPromotionExtConfigsBatchResponse,
} from "../../../../types"
import {
  createPromotionExtConfigsWorkflow,
  deletePromotionExtConfigsWorkflow,
  updatePromotionExtConfigsWorkflow,
} from "../../../../workflows/promotion-ext"
import { PROMOTION_EXT_CONFIG_MODEL } from "../../../../modules/promotion-ext/constants"

export const POST = async (
  req: MedusaRequest<AdminBatchCreatePromotionExtConfigPayload>,
  res: MedusaResponse<AdminPromotionExtConfigsBatchResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await createPromotionExtConfigsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = (result as { id: string }[]).map((c) => c.id)

  const { data: promotion_ext_configs } = await query.graph({
    entity: PROMOTION_EXT_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(201).json({ promotion_ext_configs: promotion_ext_configs as never })
}

export const PATCH = async (
  req: MedusaRequest<AdminBatchUpdatePromotionExtConfigPayload>,
  res: MedusaResponse<AdminPromotionExtConfigsBatchResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { result } = await updatePromotionExtConfigsWorkflow(req.scope).run({
    input: req.validatedBody,
  })

  const ids = (result as { id: string }[]).map((c) => c.id)

  const { data: promotion_ext_configs } = await query.graph({
    entity: PROMOTION_EXT_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id: ids },
  })

  res.status(200).json({ promotion_ext_configs: promotion_ext_configs as never })
}

export const DELETE = async (
  req: MedusaRequest<AdminBatchDeletePromotionExtConfigPayload>,
  res: MedusaResponse<AdminPromotionExtConfigsBatchDeleteResponse>
) => {
  const { ids } = req.validatedBody

  await deletePromotionExtConfigsWorkflow(req.scope).run({ input: { ids } })

  res.status(200).json({ ids, deleted: true })
}
