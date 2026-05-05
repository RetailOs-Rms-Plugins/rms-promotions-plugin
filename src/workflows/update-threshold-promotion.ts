import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import {
  validateThresholdUpdateInputStep,
  ThresholdPromotionUpdateInput,
} from "./steps/validate-threshold-update-input"
import { updateThresholdRuleStep } from "./steps/update-threshold-rule"
import { updateMedusaPromotionStep } from "./steps/update-medusa-promotion"

export const updateThresholdPromotionWorkflow = createWorkflow(
  "update-threshold-promotion",
  (input: ThresholdPromotionUpdateInput) => {
    validateThresholdUpdateInputStep(input)

    updateThresholdRuleStep({
      ruleId: input.thresholdRuleId,
      minCartSubtotal: input.minCartSubtotal,
    })

    updateMedusaPromotionStep(input)

    return new WorkflowResponse(void 0)
  }
)
