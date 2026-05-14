import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext"
import PromotionExtModuleService from "../../../../modules/promotion-ext/service"

export const updatePromotionExtConfigsStepId = "update-promotion-ext-configs-step"

type UpdatePromotionExtConfigsStepInput = {
  items: {
    id: string
    auto_apply?: boolean
  }[]
}

export const updatePromotionExtConfigsStep = createStep(
  updatePromotionExtConfigsStepId,
  async (input: UpdatePromotionExtConfigsStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const originals = await service.listPromotionExtConfigs({
      id: input.items.map((i) => i.id),
    })
    const updated = await service.updatePromotionExtConfigs(input.items)
    return new StepResponse(updated, originals)
  },
  async (originals: { id: string; auto_apply: boolean }[] | undefined, { container }) => {
    if (!originals?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.updatePromotionExtConfigs(originals)
  }
)
