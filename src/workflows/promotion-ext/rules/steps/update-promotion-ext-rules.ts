import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion_ext"
import PromotionExtModuleService from "../../../../modules/promotion_ext/service"

export const updatePromotionExtRulesStepId = "update-promotion-ext-rules-step"

type UpdatePromotionExtRulesStepInput = {
  items: {
    id: string
    rule_type?: string
    config?: Record<string, unknown>
  }[]
}

export const updatePromotionExtRulesStep = createStep(
  updatePromotionExtRulesStepId,
  async (input: UpdatePromotionExtRulesStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const originals = await service.listPromotionExtRules({
      id: input.items.map((i) => i.id),
    })
    const updated = await service.updatePromotionExtRules(input.items)
    return new StepResponse(updated, originals)
  },
  async (
    originals: { id: string; rule_type: string; config: Record<string, unknown> }[] | undefined,
    { container }
  ) => {
    if (!originals?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.updatePromotionExtRules(originals)
  }
)
