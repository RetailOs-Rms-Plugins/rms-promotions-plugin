import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const createRmsRuleGroupsStepId = "create-rms-rule-groups-step"

type CreateRmsRuleGroupsStepInput = {
  items: {
    promotion_config_id: string
    type: "include" | "exclude"
  }[]
}

export const createRmsRuleGroupsStep = createStep(
  createRmsRuleGroupsStepId,
  async (input: CreateRmsRuleGroupsStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    const created = await service.createRmsRuleGroups(input.items)
    return new StepResponse(created, created.map((g) => g.id))
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.deleteRmsRuleGroups(ids)
  }
)
