import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MetadataType } from "@medusajs/framework/types"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext"
import PromotionExtModuleService from "../../../../modules/promotion-ext/service"

export const createPromotionExtRuleGroupsStepId = "create-promotion-ext-rule-groups-step"

type CreatePromotionExtRuleGroupsStepInput = {
  items: {
    promotion_config_id: string
    type: "include" | "exclude"
    metadata?: MetadataType
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
