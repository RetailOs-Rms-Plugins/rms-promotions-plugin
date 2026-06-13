import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MetadataType } from "@medusajs/framework/types"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext"
import PromotionExtModuleService from "../../../../modules/promotion-ext/service"

export const updateCartExtAdjustmentsStepId = "update-cart-ext-adjustments-step"

type UpdateCartExtAdjustmentsStepInput = {
  items: {
    id: string
    amount?: number
    description?: string | null
    is_tax_inclusive?: boolean
    metadata?: MetadataType
  }[]
}

export const updateCartExtAdjustmentsStep = createStep(
  updateCartExtAdjustmentsStepId,
  async (input: UpdateCartExtAdjustmentsStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const existing = await service.listCartExtAdjustments({
      id: input.items.map((i) => i.id),
    })
    const updated = await service.updateCartExtAdjustments(input.items)
    return new StepResponse(updated, existing)
  },
  async (previousData: any[] | undefined, { container }) => {
    if (!previousData?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.updateCartExtAdjustments(
      previousData.map((d) => ({
        id: d.id,
        amount: d.amount,
        description: d.description,
        is_tax_inclusive: d.is_tax_inclusive,
        metadata: d.metadata,
      }))
    )
  }
)
