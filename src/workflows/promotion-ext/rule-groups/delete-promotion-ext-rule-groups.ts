import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { deletePromotionExtRuleGroupsStep } from "./steps"

type DeletePromotionExtRuleGroupsWorkflowInput = { ids: string[] }

export const deletePromotionExtRuleGroupsWorkflowId = "delete-promotion-ext-rule-groups"

export const deletePromotionExtRuleGroupsWorkflow = createWorkflow(
  deletePromotionExtRuleGroupsWorkflowId,
  (input: WorkflowData<DeletePromotionExtRuleGroupsWorkflowInput>) => {
    const result = deletePromotionExtRuleGroupsStep(input)
    return new WorkflowResponse(result)
  }
)
