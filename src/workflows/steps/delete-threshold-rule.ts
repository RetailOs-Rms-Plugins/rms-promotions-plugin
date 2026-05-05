import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { THRESHOLD_PROMOTION_MODULE } from "../../modules/threshold-promotion"
import ThresholdPromotionModuleService from "../../modules/threshold-promotion/service"

export const deleteThresholdRuleStep = createStep(
  "delete-threshold-rule",
  async ({ ruleId }: { ruleId: string }, { container }) => {
    const service: ThresholdPromotionModuleService = container.resolve(THRESHOLD_PROMOTION_MODULE)
    await service.deleteThresholdRules(ruleId)
    return new StepResponse(void 0)
  }
)
