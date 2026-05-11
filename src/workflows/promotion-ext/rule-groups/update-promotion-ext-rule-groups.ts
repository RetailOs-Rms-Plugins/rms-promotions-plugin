import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updatePromotionExtRuleGroupsStep } from "./steps"

type UpdatePromotionExtRuleGroupsWorkflowInput = {
  items: {
    id: string
    type?: "include" | "exclude"
  }[]
}

export const updatePromotionExtRuleGroupsWorkflowId = "update-promotion-ext-rule-groups"

export const updatePromotionExtRuleGroupsWorkflow = createWorkflow(
  updatePromotionExtRuleGroupsWorkflowId,
  (input: WorkflowData<UpdatePromotionExtRuleGroupsWorkflowInput>) => {
    const updated = updatePromotionExtRuleGroupsStep(input)
    return new WorkflowResponse(updated)
  }
)
