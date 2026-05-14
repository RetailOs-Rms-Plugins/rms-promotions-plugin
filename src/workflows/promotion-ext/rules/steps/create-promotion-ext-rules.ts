import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PROMOTION_EXT_MODULE } from "../../../../modules/promotion-ext"
import PromotionExtModuleService from "../../../../modules/promotion-ext/service"

export const createPromotionExtRulesStepId = "create-promotion-ext-rules-step"

type CreatePromotionExtRulesStepInput = {
  items: {
    rule_group_id: string
    rule_type: string
    config: Record<string, unknown>
  }[]
}

export const createPromotionExtRulesStep = createStep(
  createPromotionExtRulesStepId,
  async (input: CreatePromotionExtRulesStepInput, { container }) => {
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    const created = await service.createPromotionExtRules(input.items)
    return new StepResponse(
      created,
      (created as { id: string }[]).map((r) => r.id)
    )
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) return
    const service: PromotionExtModuleService = container.resolve(PROMOTION_EXT_MODULE)
    await service.deletePromotionExtRules(ids)
  }
)
