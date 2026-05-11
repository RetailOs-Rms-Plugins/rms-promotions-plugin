import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const deleteRmsRuleGroupsStepId = "delete-rms-rule-groups-step"

type DeleteRmsRuleGroupsStepInput = { ids: string[] }

export const deleteRmsRuleGroupsStep = createStep(
  deleteRmsRuleGroupsStepId,
  async (input: DeleteRmsRuleGroupsStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)

    const originals = await service.listRmsRuleGroups({ id: input.ids })

    await service.softDeleteRmsRuleGroups(input.ids)

    return new StepResponse(input.ids, originals)
  },
  async (originals: { id: string }[] | undefined, { container }) => {
    if (!originals?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.restoreRmsRuleGroups(originals.map((o) => o.id))
  }
)
