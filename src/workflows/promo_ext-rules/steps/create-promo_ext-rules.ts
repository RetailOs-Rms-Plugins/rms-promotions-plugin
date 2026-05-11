import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const createRmsRulesStepId = "create-rms-rules-step"

type CreateRmsRulesStepInput = {
  items: {
    rule_group_id: string
    rule_type: string
    config: Record<string, unknown>
  }[]
}

export const createRmsRulesStep = createStep(
  createRmsRulesStepId,
  async (input: CreateRmsRulesStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    const created = await service.createRmsRules(input.items)
    return new StepResponse(created, created.map((r) => r.id))
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.deleteRmsRules(ids)
  }
)
