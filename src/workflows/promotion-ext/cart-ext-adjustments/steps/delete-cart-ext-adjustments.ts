import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext"
import PromotionExtModuleService from "../../../../modules/promotion-ext/service"

export const deleteCartExtAdjustmentsStepId = "delete-cart-ext-adjustments-step"

type DeleteCartExtAdjustmentsStepInput = { ids: string[] }

export const deleteCartExtAdjustmentsStep = createStep(
  deleteCartExtAdjustmentsStepId,
  async (input: DeleteCartExtAdjustmentsStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const uniqueIds = [...new Set(input.ids)].filter(Boolean)

    if (!uniqueIds.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "at least one id must be provided")
    }

    const existing = await service.listCartExtAdjustments({ id: uniqueIds })
    const existingIds = new Set(existing.map((c: { id: string }) => c.id))
    const missing = uniqueIds.filter((id) => !existingIds.has(id))

    if (missing.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Cart ext adjustment not found for ids: ${missing.join(", ")}`
      )
    }

    await service.deleteCartExtAdjustments(uniqueIds)
    return new StepResponse({ ids: uniqueIds }, existing)
  },
  async (previousData: any[] | undefined, { container }) => {
    if (!previousData?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.createCartExtAdjustments(previousData)
  }
)
