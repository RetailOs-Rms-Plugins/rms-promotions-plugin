import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteRmsPromotionConfigsStep } from "./steps"

type DeleteRmsPromotionConfigsWorkflowInput = { ids: string[] }

export const deleteRmsPromotionConfigsWorkflow = createWorkflow(
  "delete-rms-promotion-configs",
  (input: WorkflowData<DeleteRmsPromotionConfigsWorkflowInput>) => {
    const ids = deleteRmsPromotionConfigsStep(input)
    return new WorkflowResponse(ids)
  }
)
