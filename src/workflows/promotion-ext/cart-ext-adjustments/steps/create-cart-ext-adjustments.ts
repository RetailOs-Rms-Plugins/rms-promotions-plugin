import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MetadataType } from "@medusajs/framework/types"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext"
import PromotionExtModuleService from "../../../../modules/promotion-ext/service"

export const createCartExtAdjustmentsStepId = "create-cart-ext-adjustments-step"

type CreateCartExtAdjustmentsStepInput = {
  items: {
    cart_id: string
    item_id: string | null
    amount: number
    code: string | null
    source: string
    description?: string | null
    promotion_id?: string | null
    provider_id?: string | null
    is_tax_inclusive?: boolean
    metadata?: MetadataType
  }[]
}

export const createCartExtAdjustmentsStep = createStep(
  createCartExtAdjustmentsStepId,
  async (input: CreateCartExtAdjustmentsStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const created = await service.createCartExtAdjustments(input.items)
    return new StepResponse(
      created,
      (created as { id: string }[]).map((c) => c.id)
    )
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.deleteCartExtAdjustments(ids)
  }
)
