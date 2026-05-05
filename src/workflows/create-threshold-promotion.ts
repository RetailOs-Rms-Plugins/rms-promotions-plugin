import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { validateThresholdInputStep, ThresholdPromotionInput } from "./steps/validate-threshold-input"
import { createMedusaPromotionStep } from "./steps/create-medusa-promotion"
import { createThresholdRuleStep } from "./steps/create-threshold-rule"
import { createPromotionThresholdLinkStep } from "./steps/create-promotion-threshold-link"

export const createThresholdPromotionWorkflow = createWorkflow(
  "create-threshold-promotion",
  (input: ThresholdPromotionInput) => {
    validateThresholdInputStep(input)

    const promotion = createMedusaPromotionStep(input)

    const rule = createThresholdRuleStep({
      min_cart_subtotal: input.minCartSubtotal,
    })

    createPromotionThresholdLinkStep({
      promotionId: promotion.id,
      thresholdRuleId: rule.id,
    })

    return new WorkflowResponse({ promotion, rule })
  }
)
