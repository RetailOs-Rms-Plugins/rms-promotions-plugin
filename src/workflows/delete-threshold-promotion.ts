import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { dismissPromotionThresholdLinkStep } from "./steps/dismiss-promotion-threshold-link"
import { deleteThresholdRuleStep } from "./steps/delete-threshold-rule"
import { deleteMedusaPromotionStep } from "./steps/delete-medusa-promotion"

type Input = { promotionId: string; thresholdRuleId: string }

export const deleteThresholdPromotionWorkflow = createWorkflow(
  "delete-threshold-promotion",
  (input: Input) => {
    dismissPromotionThresholdLinkStep({
      promotionId: input.promotionId,
      thresholdRuleId: input.thresholdRuleId,
    })

    deleteThresholdRuleStep({ ruleId: input.thresholdRuleId })

    deleteMedusaPromotionStep({ promotionId: input.promotionId })

    return new WorkflowResponse(void 0)
  }
)
