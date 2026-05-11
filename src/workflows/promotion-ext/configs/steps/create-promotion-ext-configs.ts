import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion_ext"
import PromotionExtModuleService from "../../../../modules/promotion_ext/service"

export const createPromotionExtConfigsStepId = "create-promotion-ext-configs-step"

type CreatePromotionExtConfigsStepInput = {
  items: {
    promotion_id: string
    auto_apply?: boolean
  }[]
}

export const createPromotionExtConfigsStep = createStep(
  createPromotionExtConfigsStepId,
  async (input: CreatePromotionExtConfigsStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const created = await service.createPromotionExtConfigs(input.items)
    return new StepResponse(
      created,
      (created as { id: string }[]).map((c) => c.id)
    )
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.deletePromotionExtConfigs(ids)
  }
)
