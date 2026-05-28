import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  AdminPromotionExtConfigDeleteResponse,
  AdminPromotionExtConfigResponse,
  AdminUpdatePromotionExtConfigPayload,
} from "../../../../types"
import {
  deletePromotionExtConfigsWorkflow,
  updatePromotionExtConfigsWorkflow,
} from "../../../../workflows/promotion-ext"
import { PROMOTION_EXT_CONFIG_MODEL } from "../../../../modules/promotion-ext/constants"
import { validatePromotionModeCompatibility } from "../mode-validation"

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse<AdminPromotionExtConfigResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [promotion_ext_config],
  } = await query.graph({
    entity: PROMOTION_EXT_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id },
  })

  if (!promotion_ext_config) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Promotion ext config with id "${id}" not found`
    )
  }

  res.status(200).json({ promotion_ext_config: promotion_ext_config as never })
}

export const PATCH = async (
  req: MedusaRequest<AdminUpdatePromotionExtConfigPayload>,
  res: MedusaResponse<AdminPromotionExtConfigResponse>
) => {
  const { id } = req.params
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  if (req.validatedBody.promotion_mode && req.validatedBody.promotion_mode !== "standard") {
    const {
      data: [existingConfig],
    } = await query.graph({
      entity: PROMOTION_EXT_CONFIG_MODEL,
      fields: ["promotion_id"],
      filters: { id },
    })

    if (!existingConfig) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Promotion ext config with id "${id}" not found`)
    }

    await validatePromotionModeCompatibility(
      query,
      (existingConfig as any).promotion_id,
      req.validatedBody.promotion_mode,
      req.validatedBody.mode_config
    )
  }

  const { result } = await updatePromotionExtConfigsWorkflow(req.scope).run({
    input: { items: [{ id, ...req.validatedBody }] },
  })

  const {
    data: [promotion_ext_config],
  } = await query.graph({
    entity: PROMOTION_EXT_CONFIG_MODEL,
    ...req.queryConfig,
    filters: { id: (result as { id: string }[])[0].id },
  })

  res.status(200).json({ promotion_ext_config: promotion_ext_config as never })
}

export const DELETE = async (
  req: MedusaRequest,
  res: MedusaResponse<AdminPromotionExtConfigDeleteResponse>
) => {
  const { id } = req.params

  await deletePromotionExtConfigsWorkflow(req.scope).run({
    input: { ids: [id] },
  })

  res.status(200).json({ id, object: "promotion_ext_config", deleted: true })
}
