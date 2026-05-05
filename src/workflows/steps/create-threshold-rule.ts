import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { THRESHOLD_PROMOTION_MODULE } from "../../modules/threshold-promotion"
import ThresholdPromotionModuleService from "../../modules/threshold-promotion/service"

type Input = { min_cart_subtotal: number }

export const createThresholdRuleStep = createStep(
  "create-threshold-rule",
  async ({ min_cart_subtotal }: Input, { container }) => {
    const service: ThresholdPromotionModuleService = container.resolve(THRESHOLD_PROMOTION_MODULE)
    const rule = await service.createThresholdRules({ min_cart_subtotal })
    return new StepResponse(rule, rule.id)
  },
  async (ruleId: string, { container }) => {
    if (!ruleId) return
    const service: ThresholdPromotionModuleService = container.resolve(THRESHOLD_PROMOTION_MODULE)
    await service.deleteThresholdRules(ruleId)
  }
)
