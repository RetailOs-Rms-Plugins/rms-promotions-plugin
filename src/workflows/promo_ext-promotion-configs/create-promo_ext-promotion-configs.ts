import { createWorkflow, WorkflowData, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createRmsPromotionConfigsStep } from "./steps"

type CreateRmsPromotionConfigsWorkflowInput = {
  items: {
    promotion_id: string
    rms_auto_apply?: boolean
  }[]
}

export const createRmsPromotionConfigsWorkflow = createWorkflow(
  "create-rms-promotion-configs",
  (input: WorkflowData<CreateRmsPromotionConfigsWorkflowInput>) => {
    const created = createRmsPromotionConfigsStep(input)
    return new WorkflowResponse(created)
  }
)
