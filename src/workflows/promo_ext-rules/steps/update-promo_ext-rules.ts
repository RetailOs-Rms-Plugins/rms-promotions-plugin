import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { RMS_PROMOTION_RULES_MODULE } from "../../../modules/rms-promotion-rules"
import RmsPromotionRulesModuleService from "../../../modules/rms-promotion-rules/service"

export const updateRmsRulesStepId = "update-rms-rules-step"

type UpdateRmsRulesStepInput = {
  items: {
    id: string
    rule_type?: string
    config?: Record<string, unknown>
  }[]
}

export const updateRmsRulesStep = createStep(
  updateRmsRulesStepId,
  async (input: UpdateRmsRulesStepInput, { container }) => {
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)

    const originals = await service.listRmsRules({
      id: input.items.map((i) => i.id),
    })

    const updated = await service.updateRmsRules(input.items)

    return new StepResponse(updated, originals)
  },
  async (originals: { id: string; rule_type: string; config: Record<string, unknown> }[] | undefined, { container }) => {
    if (!originals?.length) return
    const service: RmsPromotionRulesModuleService = container.resolve(RMS_PROMOTION_RULES_MODULE)
    await service.updateRmsRules(originals)
  }
)
