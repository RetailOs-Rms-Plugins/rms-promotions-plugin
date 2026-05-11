import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { deletePromotionExtRulesStep } from "./steps"

type DeletePromotionExtRulesWorkflowInput = { ids: string[] }

export const deletePromotionExtRulesWorkflowId = "delete-promotion-ext-rules"

export const deletePromotionExtRulesWorkflow = createWorkflow(
  deletePromotionExtRulesWorkflowId,
  (input: WorkflowData<DeletePromotionExtRulesWorkflowInput>) => {
    const result = deletePromotionExtRulesStep(input)
    return new WorkflowResponse(result)
  }
)
