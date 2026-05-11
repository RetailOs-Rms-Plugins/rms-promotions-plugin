import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updatePromotionExtRulesStep } from "./steps"

type UpdatePromotionExtRulesWorkflowInput = {
  items: {
    id: string
    rule_type?: string
    config?: Record<string, unknown>
  }[]
}

export const updatePromotionExtRulesWorkflowId = "update-promotion-ext-rules"

export const updatePromotionExtRulesWorkflow = createWorkflow(
  updatePromotionExtRulesWorkflowId,
  (input: WorkflowData<UpdatePromotionExtRulesWorkflowInput>) => {
    const updated = updatePromotionExtRulesStep(input)
    return new WorkflowResponse(updated)
  }
)
