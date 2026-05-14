import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext"
import PromotionExtModuleService from "../../../../modules/promotion-ext/service"

export const updatePromotionExtRuleGroupsStepId = "update-promotion-ext-rule-groups-step"

type UpdatePromotionExtRuleGroupsStepInput = {
  items: {
    id: string
    type?: "include" | "exclude"
  }[]
}

export const updatePromotionExtRuleGroupsStep = createStep(
  updatePromotionExtRuleGroupsStepId,
  async (input: UpdatePromotionExtRuleGroupsStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const originals = await service.listPromotionExtRuleGroups({
      id: input.items.map((i) => i.id),
    })
    const updated = await service.updatePromotionExtRuleGroups(input.items)
    return new StepResponse(updated, originals)
  },
  async (originals: { id: string; type: string }[] | undefined, { container }) => {
    if (!originals?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.updatePromotionExtRuleGroups(originals)
  }
)
