import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateRmsPromotionConfigsStep } from "./steps"

type UpdateRmsPromotionConfigsWorkflowInput = {
  items: {
    id: string
    promotion_id?: string
    rms_auto_apply?: boolean
  }[]
}

export const updateRmsPromotionConfigsWorkflow = createWorkflow(
  "update-rms-promotion-configs",
  (input: WorkflowData<UpdateRmsPromotionConfigsWorkflowInput>) => {
    const updated = updateRmsPromotionConfigsStep(input)
    return new WorkflowResponse(updated)
  }
)
