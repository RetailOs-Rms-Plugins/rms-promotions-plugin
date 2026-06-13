import {
  createWorkflow,
  WorkflowData,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MetadataType } from "@medusajs/framework/types"
import { updatePromotionExtConfigsStep } from "./steps"

type UpdatePromotionExtConfigsWorkflowInput = {
  items: {
    id: string
    auto_apply?: boolean
    metadata?: MetadataType
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
