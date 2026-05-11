import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion_ext"
import PromotionExtModuleService from "../../../../modules/promotion_ext/service"

export const deletePromotionExtRulesStepId = "delete-promotion-ext-rules-step"

type DeletePromotionExtRulesStepInput = { ids: string[] }

export const deletePromotionExtRulesStep = createStep(
  deletePromotionExtRulesStepId,
  async (input: DeletePromotionExtRulesStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const uniqueIds = [...new Set(input.ids)].filter(Boolean)

    if (!uniqueIds.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "at least one id must be provided")
    }

    const existing = await service.listPromotionExtRules({ id: uniqueIds })
    const existingIds = new Set(existing.map((r: { id: string }) => r.id))
    const missing = uniqueIds.filter((id) => !existingIds.has(id))

    if (missing.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Promotion ext rule not found for ids: ${missing.join(", ")}`
      )
    }

    await service.softDeletePromotionExtRules(uniqueIds)
    return new StepResponse({ ids: uniqueIds }, { ids: uniqueIds })
  },
  async (data: { ids: string[] } | undefined, { container }) => {
    if (!data?.ids?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.restorePromotionExtRules(data.ids)
  }
)
