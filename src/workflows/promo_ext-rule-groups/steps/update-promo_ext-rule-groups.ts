import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const updateRmsRuleGroupsStepId = "update-rms-rule-groups-step"

type UpdateRmsRuleGroupsStepInput = {
  items: {
    id: string
    type?: "include" | "exclude"
  }[]
}

export const updateRmsRuleGroupsStep = createStep(
  updateRmsRuleGroupsStepId,
  async (input: UpdateRmsRuleGroupsStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)

    const originals = await service.listRmsRuleGroups({
      id: input.items.map((i) => i.id),
    })

    const updated = await service.updateRmsRuleGroups(input.items)

    return new StepResponse(updated, originals)
  },
  async (originals: { id: string; type: string }[] | undefined, { container }) => {
    if (!originals?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.updateRmsRuleGroups(originals)
  }
)
