import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext"
import PromotionExtModuleService from "../../../../modules/promotion-ext/service"

export const deletePromotionExtConfigsStepId = "delete-promotion-ext-configs-step"

type DeletePromotionExtConfigsStepInput = { ids: string[] }

export const deletePromotionExtConfigsStep = createStep(
  deletePromotionExtConfigsStepId,
  async (input: DeletePromotionExtConfigsStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const uniqueIds = [...new Set(input.ids)].filter(Boolean)

    if (!uniqueIds.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "at least one id must be provided")
    }

    const existing = await service.listPromotionExtConfigs({ id: uniqueIds })
    const existingIds = new Set(existing.map((c: { id: string }) => c.id))
    const missing = uniqueIds.filter((id) => !existingIds.has(id))

    if (missing.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Promotion ext config not found for ids: ${missing.join(", ")}`
      )
    }

    await service.softDeletePromotionExtConfigs(uniqueIds)
    return new StepResponse({ ids: uniqueIds }, { ids: uniqueIds })
  },
  async (data: { ids: string[] } | undefined, { container }) => {
    if (!data?.ids?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.restorePromotionExtConfigs(data.ids)
  }
)
