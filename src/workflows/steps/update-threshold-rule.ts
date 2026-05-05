import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { THRESHOLD_PROMOTION_MODULE } from "../../modules/threshold-promotion"
import ThresholdPromotionModuleService from "../../modules/threshold-promotion/service"

type Input = { ruleId: string; minCartSubtotal?: number }

export const updateThresholdRuleStep = createStep(
  "update-threshold-rule",
  async ({ ruleId, minCartSubtotal }: Input, { container }) => {
    if (minCartSubtotal === undefined) return new StepResponse(void 0)

    const service: ThresholdPromotionModuleService = container.resolve(THRESHOLD_PROMOTION_MODULE)
    await service.updateThresholdRules({ id: ruleId, min_cart_subtotal: minCartSubtotal })
    return new StepResponse(void 0)
  }
)
