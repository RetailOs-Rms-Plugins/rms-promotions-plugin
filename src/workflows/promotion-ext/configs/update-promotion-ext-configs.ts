import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { updatePromotionExtConfigsStep } from "./steps"

type UpdatePromotionExtConfigsWorkflowInput = {
  items: {
    id: string
    auto_apply?: boolean
  }[]
}

export const updatePromotionExtConfigsWorkflowId = "update-promotion-ext-configs"

export const updatePromotionExtConfigsWorkflow = createWorkflow(
  updatePromotionExtConfigsWorkflowId,
  (input: WorkflowData<UpdatePromotionExtConfigsWorkflowInput>) => {
    const updated = updatePromotionExtConfigsStep(input)
    return new WorkflowResponse(updated)
  }
)
