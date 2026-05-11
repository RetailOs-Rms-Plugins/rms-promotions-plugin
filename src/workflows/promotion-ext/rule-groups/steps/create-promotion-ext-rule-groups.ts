import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion_ext"
import PromotionExtModuleService from "../../../../modules/promotion_ext/service"

export const createPromotionExtRuleGroupsStepId = "create-promotion-ext-rule-groups-step"

type CreatePromotionExtRuleGroupsStepInput = {
  items: {
    promotion_config_id: string
    type: "include" | "exclude"
  }[]
}

export const createPromotionExtRuleGroupsStep = createStep(
  createPromotionExtRuleGroupsStepId,
  async (input: CreatePromotionExtRuleGroupsStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const created = await service.createPromotionExtRuleGroups(input.items)
    return new StepResponse(
      created,
      (created as { id: string }[]).map((g) => g.id)
    )
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.deletePromotionExtRuleGroups(ids)
  }
)
